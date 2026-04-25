// Package azureblobpresign refreshes SAS URLs for attachments stored in Azure Blob Storage.
package azureblobpresign

import (
	"context"
	"log/slog"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/usememos/memos/internal/storage/azureblob"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

// Runner periodically renews Azure Blob Storage SAS URLs that are nearing expiry.
type Runner struct {
	Store *store.Store
}

// NewRunner constructs a new Azure Blob Storage SAS refresh runner.
func NewRunner(store *store.Store) *Runner {
	return &Runner{
		Store: store,
	}
}

// runnerInterval matches the s3presign cadence (every 12 hours).
const runnerInterval = time.Hour * 12

// Run starts the periodic refresh loop until ctx is cancelled.
func (r *Runner) Run(ctx context.Context) {
	ticker := time.NewTicker(runnerInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			r.RunOnce(ctx)
		case <-ctx.Done():
			return
		}
	}
}

// RunOnce performs a single refresh pass.
func (r *Runner) RunOnce(ctx context.Context) {
	r.CheckAndPresign(ctx)
}

// CheckAndPresign refreshes SAS URLs whose expiry is within the next day.
func (r *Runner) CheckAndPresign(ctx context.Context) {
	instanceStorageSetting, err := r.Store.GetInstanceStorageSetting(ctx)
	if err != nil {
		return
	}

	azureBlobStorageType := storepb.AttachmentStorageType_AZURE_BLOB
	const batchSize = 100
	offset := 0

	for {
		limit := batchSize
		attachments, err := r.Store.ListAttachments(ctx, &store.FindAttachment{
			GetBlob:     false,
			StorageType: &azureBlobStorageType,
			Limit:       &limit,
			Offset:      &offset,
		})
		if err != nil {
			slog.Error("Failed to list attachments for Azure Blob Storage presigning", "error", err)
			return
		}

		if len(attachments) == 0 {
			break
		}

		presignCount := 0
		for _, attachment := range attachments {
			payload := attachment.Payload.GetAzureBlobObject()
			if payload == nil {
				continue
			}

			if payload.LastPresignedTime != nil {
				// Skip if the SAS URL is still valid for the next 4 days.
				// The expiration time is set to 5 days.
				if time.Now().Before(payload.LastPresignedTime.AsTime().Add(4 * 24 * time.Hour)) {
					continue
				}
			}

			cfg := instanceStorageSetting.GetAzureBlobConfig()
			if payload.AzureBlobConfig != nil {
				cfg = payload.AzureBlobConfig
			}
			if cfg == nil {
				slog.Error("Azure Blob Storage config is not found")
				continue
			}

			client, err := azureblob.NewClient(ctx, cfg)
			if err != nil {
				slog.Error("Failed to create Azure Blob Storage client", "error", err)
				continue
			}

			presignURL, err := client.PresignGetObject(ctx, payload.Key)
			if err != nil {
				slog.Error("Failed to presign Azure Blob URL", "error", err, "attachmentID", attachment.ID)
				continue
			}

			payload.AzureBlobConfig = cfg
			payload.LastPresignedTime = timestamppb.New(time.Now())
			if err := r.Store.UpdateAttachment(ctx, &store.UpdateAttachment{
				ID:        attachment.ID,
				Reference: &presignURL,
				Payload: &storepb.AttachmentPayload{
					Payload: &storepb.AttachmentPayload_AzureBlobObject_{
						AzureBlobObject: payload,
					},
				},
			}); err != nil {
				slog.Error("Failed to update attachment", "error", err, "attachmentID", attachment.ID)
				continue
			}
			presignCount++
		}

		slog.Info("Presigned batch of Azure Blob attachments", "batchSize", len(attachments), "presigned", presignCount)

		offset += len(attachments)
	}
}
