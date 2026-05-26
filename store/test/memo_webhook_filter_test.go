package test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/store"
)

// TestListMemosIDPlusFilter exercises the dual ID + CEL filter condition that
// the webhook dispatcher relies on. ListMemos must AND the two together: only
// when the row matched by ID *also* satisfies the CEL filter should a result
// be returned.
func TestListMemosIDPlusFilter(t *testing.T) {
	t.Parallel()
	tc := NewMemoFilterTestContext(t)
	defer tc.Close()

	publicMemo := tc.CreateMemo(NewMemoBuilder("public-memo", tc.User.ID).
		Content("public content").
		Visibility(store.Public).
		Tags("work"))
	privateMemo := tc.CreateMemo(NewMemoBuilder("private-memo", tc.User.ID).
		Content("private content").
		Visibility(store.Private).
		Tags("personal"))

	limit := 1

	cases := []struct {
		name      string
		memoID    int32
		filter    string
		wantMatch bool
	}{
		{
			name:      "matching id + matching filter returns the row",
			memoID:    publicMemo.ID,
			filter:    `visibility == "PUBLIC"`,
			wantMatch: true,
		},
		{
			name:      "matching id + non-matching filter returns nothing",
			memoID:    publicMemo.ID,
			filter:    `visibility == "PRIVATE"`,
			wantMatch: false,
		},
		{
			name:      "id of a different memo + filter that matches the other one returns nothing",
			memoID:    privateMemo.ID,
			filter:    `visibility == "PUBLIC"`,
			wantMatch: false,
		},
		{
			name:      "tag filter that matches the targeted memo",
			memoID:    publicMemo.ID,
			filter:    `"work" in tags`,
			wantMatch: true,
		},
		{
			name:      "tag filter that matches a different memo only",
			memoID:    publicMemo.ID,
			filter:    `"personal" in tags`,
			wantMatch: false,
		},
		{
			name:      "compound filter — both clauses must hold and apply only to the id row",
			memoID:    publicMemo.ID,
			filter:    `visibility == "PUBLIC" && "work" in tags`,
			wantMatch: true,
		},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			rows, err := tc.Store.ListMemos(tc.Ctx, &store.FindMemo{
				ID:      &tt.memoID,
				Filters: []string{tt.filter},
				Limit:   &limit,
			})
			require.NoError(t, err)
			if tt.wantMatch {
				require.Len(t, rows, 1)
				require.Equal(t, tt.memoID, rows[0].ID)
			} else {
				require.Empty(t, rows)
			}
		})
	}
}
