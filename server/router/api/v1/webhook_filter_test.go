package v1

import (
	"testing"

	"github.com/stretchr/testify/require"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
)

func TestWebhookMatchesFilter(t *testing.T) {
	t.Parallel()

	memo := func(visibility v1pb.Visibility, tags ...string) *v1pb.Memo {
		return &v1pb.Memo{Visibility: visibility, Tags: tags}
	}

	tests := []struct {
		name         string
		filter       *storepb.WebhooksUserSetting_Webhook_Filter
		activityType string
		memo         *v1pb.Memo
		want         bool
	}{
		{
			name:         "nil filter matches everything",
			filter:       nil,
			activityType: "memos.memo.created",
			memo:         memo(v1pb.Visibility_PRIVATE),
			want:         true,
		},
		{
			name: "activity type match",
			filter: &storepb.WebhooksUserSetting_Webhook_Filter{
				ActivityTypes: []string{"memos.memo.created"},
			},
			activityType: "memos.memo.created",
			memo:         memo(v1pb.Visibility_PUBLIC),
			want:         true,
		},
		{
			name: "activity type miss",
			filter: &storepb.WebhooksUserSetting_Webhook_Filter{
				ActivityTypes: []string{"memos.memo.created"},
			},
			activityType: "memos.memo.updated",
			memo:         memo(v1pb.Visibility_PUBLIC),
			want:         false,
		},
		{
			name: "visibility match",
			filter: &storepb.WebhooksUserSetting_Webhook_Filter{
				Visibilities: []string{"PUBLIC", "PROTECTED"},
			},
			activityType: "memos.memo.created",
			memo:         memo(v1pb.Visibility_PROTECTED),
			want:         true,
		},
		{
			name: "visibility miss",
			filter: &storepb.WebhooksUserSetting_Webhook_Filter{
				Visibilities: []string{"PUBLIC"},
			},
			activityType: "memos.memo.created",
			memo:         memo(v1pb.Visibility_PRIVATE),
			want:         false,
		},
		{
			name: "tag overlap matches",
			filter: &storepb.WebhooksUserSetting_Webhook_Filter{
				Tags: []string{"work"},
			},
			activityType: "memos.memo.created",
			memo:         memo(v1pb.Visibility_PUBLIC, "personal", "work"),
			want:         true,
		},
		{
			name: "tag no overlap",
			filter: &storepb.WebhooksUserSetting_Webhook_Filter{
				Tags: []string{"work"},
			},
			activityType: "memos.memo.created",
			memo:         memo(v1pb.Visibility_PUBLIC, "personal"),
			want:         false,
		},
		{
			name: "memo with no tags fails tag filter",
			filter: &storepb.WebhooksUserSetting_Webhook_Filter{
				Tags: []string{"work"},
			},
			activityType: "memos.memo.created",
			memo:         memo(v1pb.Visibility_PUBLIC),
			want:         false,
		},
		{
			name: "all dimensions must match",
			filter: &storepb.WebhooksUserSetting_Webhook_Filter{
				ActivityTypes: []string{"memos.memo.created"},
				Visibilities:  []string{"PUBLIC"},
				Tags:          []string{"work"},
			},
			activityType: "memos.memo.created",
			memo:         memo(v1pb.Visibility_PUBLIC, "work"),
			want:         true,
		},
		{
			name: "partial match (visibility fails) rejects",
			filter: &storepb.WebhooksUserSetting_Webhook_Filter{
				ActivityTypes: []string{"memos.memo.created"},
				Visibilities:  []string{"PUBLIC"},
				Tags:          []string{"work"},
			},
			activityType: "memos.memo.created",
			memo:         memo(v1pb.Visibility_PRIVATE, "work"),
			want:         false,
		},
		{
			name:         "empty filter is no-op (matches)",
			filter:       &storepb.WebhooksUserSetting_Webhook_Filter{},
			activityType: "memos.memo.created",
			memo:         memo(v1pb.Visibility_PRIVATE),
			want:         true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := webhookMatchesFilter(tt.filter, tt.activityType, tt.memo)
			require.Equal(t, tt.want, got)
		})
	}
}
