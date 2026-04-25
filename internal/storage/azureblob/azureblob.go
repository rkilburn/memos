// Package azureblob provides an Azure Blob Storage client used as an attachment backend.
package azureblob

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore/to"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/blob"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/blockblob"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/sas"
	"github.com/pkg/errors"

	storepb "github.com/usememos/memos/proto/gen/store"
)

// Client wraps the Azure Blob Storage client for a single container.
type Client struct {
	Client    *azblob.Client
	Container string
}

// presignTTL is the lifetime applied to generated SAS read URLs.
const presignTTL = 5 * 24 * time.Hour

// NewClient builds an Azure Blob Storage client from the provided config.
func NewClient(_ context.Context, cfg *storepb.StorageAzureBlobConfig) (*Client, error) {
	if cfg == nil {
		return nil, errors.New("azure blob storage config is nil")
	}
	if cfg.AccountName == "" || cfg.AccountKey == "" {
		return nil, errors.New("azure blob storage account name and key are required")
	}
	if cfg.Container == "" {
		return nil, errors.New("azure blob storage container is required")
	}

	endpoint := cfg.Endpoint
	if endpoint == "" {
		endpoint = fmt.Sprintf("https://%s.blob.core.windows.net", cfg.AccountName)
	}
	// The azblob SDK only treats endpoints whose host is a literal IP address as
	// path-style ("emulator") URLs (see azblob/internal/shared.IsIPEndpointStyle).
	// When the host is a DNS name like `localhost`, it instead assumes Azure's
	// host-style layout and parses the first path segment as the container name,
	// producing a wrong canonicalizedResource and an invalid SAS signature.
	// Rewrite `localhost` to `127.0.0.1` so Azurite-style endpoints sign correctly.
	endpoint = normalizeLocalhostEndpoint(endpoint)

	cred, err := azblob.NewSharedKeyCredential(cfg.AccountName, cfg.AccountKey)
	if err != nil {
		return nil, errors.Wrap(err, "failed to build azure blob shared key credential")
	}

	azClient, err := azblob.NewClientWithSharedKeyCredential(endpoint, cred, nil)
	if err != nil {
		return nil, errors.Wrap(err, "failed to build azure blob client")
	}

	return &Client{
		Client:    azClient,
		Container: cfg.Container,
	}, nil
}

// UploadObject uploads a blob and returns the blob name.
func (c *Client) UploadObject(ctx context.Context, key string, fileType string, content io.Reader) (string, error) {
	opts := &blockblob.UploadStreamOptions{
		HTTPHeaders: &blob.HTTPHeaders{BlobContentType: to.Ptr(fileType)},
	}
	if _, err := c.Client.UploadStream(ctx, c.Container, key, content, opts); err != nil {
		return "", errors.Wrap(err, "failed to upload blob")
	}
	return key, nil
}

// PresignGetObject generates a Service SAS URL granting read access for presignTTL.
func (c *Client) PresignGetObject(_ context.Context, key string) (string, error) {
	blobClient := c.Client.ServiceClient().NewContainerClient(c.Container).NewBlobClient(key)
	url, err := blobClient.GetSASURL(sas.BlobPermissions{Read: true}, time.Now().UTC().Add(presignTTL), nil)
	if err != nil {
		return "", errors.Wrap(err, "failed to generate azure blob SAS URL")
	}
	return url, nil
}

// GetObject downloads a blob and returns its bytes.
func (c *Client) GetObject(ctx context.Context, key string) ([]byte, error) {
	resp, err := c.Client.DownloadStream(ctx, c.Container, key, nil)
	if err != nil {
		return nil, errors.Wrap(err, "failed to download blob")
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, errors.Wrap(err, "failed to read blob body")
	}
	return data, nil
}

// GetObjectStream downloads a blob and returns a streaming reader.
func (c *Client) GetObjectStream(ctx context.Context, key string) (io.ReadCloser, error) {
	resp, err := c.Client.DownloadStream(ctx, c.Container, key, nil)
	if err != nil {
		return nil, errors.Wrap(err, "failed to open blob stream")
	}
	return resp.Body, nil
}

// DeleteObject removes a blob.
func (c *Client) DeleteObject(ctx context.Context, key string) error {
	if _, err := c.Client.DeleteBlob(ctx, c.Container, key, nil); err != nil {
		return errors.Wrap(err, "failed to delete blob")
	}
	return nil
}

// normalizeLocalhostEndpoint rewrites a `localhost` host to `127.0.0.1` so that
// the azblob SDK treats it as a path-style emulator endpoint when generating SAS URLs.
// Non-localhost endpoints are returned unchanged. Malformed inputs are passed through
// so NewClientWithSharedKeyCredential surfaces the original parse error.
func normalizeLocalhostEndpoint(endpoint string) string {
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" {
		return endpoint
	}
	host := u.Hostname()
	if !strings.EqualFold(host, "localhost") {
		return endpoint
	}
	if port := u.Port(); port != "" {
		u.Host = "127.0.0.1:" + port
	} else {
		u.Host = "127.0.0.1"
	}
	return u.String()
}
