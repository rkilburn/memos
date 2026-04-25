package azureblob

import "testing"

func TestNormalizeLocalhostEndpoint(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"localhost with port and path", "http://localhost:10000/devstoreaccount1", "http://127.0.0.1:10000/devstoreaccount1"},
		{"localhost without port", "http://localhost/devstoreaccount1", "http://127.0.0.1/devstoreaccount1"},
		{"localhost case-insensitive", "http://LocalHost:10000/devstoreaccount1", "http://127.0.0.1:10000/devstoreaccount1"},
		{"already an IP", "http://127.0.0.1:10000/devstoreaccount1", "http://127.0.0.1:10000/devstoreaccount1"},
		{"real azure host left alone", "https://acct.blob.core.windows.net", "https://acct.blob.core.windows.net"},
		{"non-localhost dns left alone", "https://example.com:443/path", "https://example.com:443/path"},
		{"empty string passes through", "", ""},
		{"malformed URL passes through", "::not a url::", "::not a url::"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := normalizeLocalhostEndpoint(tc.in)
			if got != tc.want {
				t.Errorf("normalizeLocalhostEndpoint(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
