import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userServiceClient } from "@/connect";
import useCurrentUser from "@/hooks/useCurrentUser";
import useLoading from "@/hooks/useLoading";
import { handleError } from "@/lib/error";
import { useTranslate } from "@/utils/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhookName?: string;
  onSuccess?: () => void;
}

const ACTIVITY_TYPES = ["memos.memo.created", "memos.memo.updated", "memos.memo.deleted", "memos.memo.comment.created"] as const;

const VISIBILITIES = ["PUBLIC", "PROTECTED", "PRIVATE"] as const;

interface State {
  displayName: string;
  url: string;
  activityTypes: string[];
  visibilities: string[];
  tagsInput: string;
}

const splitTags = (raw: string): string[] =>
  raw
    .split(/[,\s]+/)
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);

function CreateWebhookDialog({ open, onOpenChange, webhookName, onSuccess }: Props) {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const [state, setState] = useState<State>({
    displayName: "",
    url: "",
    activityTypes: [],
    visibilities: [],
    tagsInput: "",
  });
  const requestState = useLoading(false);
  const isCreating = webhookName === undefined;

  useEffect(() => {
    if (webhookName && currentUser) {
      userServiceClient
        .listUserWebhooks({
          parent: currentUser.name,
        })
        .then((response) => {
          const webhook = response.webhooks.find((w) => w.name === webhookName);
          if (webhook) {
            setState({
              displayName: webhook.displayName,
              url: webhook.url,
              activityTypes: webhook.filter?.activityTypes ?? [],
              visibilities: webhook.filter?.visibilities ?? [],
              tagsInput: (webhook.filter?.tags ?? []).join(", "),
            });
          }
        });
    }
  }, [webhookName, currentUser]);

  const setPartialState = (partialState: Partial<State>) => {
    setState({
      ...state,
      ...partialState,
    });
  };

  const toggleInList = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const handleTitleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPartialState({ displayName: e.target.value });
  };

  const handleUrlInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPartialState({ url: e.target.value });
  };

  const handleSaveBtnClick = async () => {
    if (!state.displayName || !state.url) {
      toast.error(t("message.fill-all-required-fields"));
      return;
    }

    if (!currentUser) {
      toast.error("User not authenticated");
      return;
    }

    const filter = {
      activityTypes: state.activityTypes,
      visibilities: state.visibilities,
      tags: splitTags(state.tagsInput),
    };

    try {
      requestState.setLoading();
      if (isCreating) {
        await userServiceClient.createUserWebhook({
          parent: currentUser.name,
          webhook: {
            displayName: state.displayName,
            url: state.url,
            filter,
          },
        });
      } else {
        await userServiceClient.updateUserWebhook({
          webhook: {
            name: webhookName,
            displayName: state.displayName,
            url: state.url,
            filter,
          },
          updateMask: create(FieldMaskSchema, { paths: ["display_name", "url", "filter"] }),
        });
      }

      onSuccess?.();
      onOpenChange(false);
      requestState.setFinish();
    } catch (error: unknown) {
      handleError(error, toast.error, {
        context: webhookName ? "Update webhook" : "Create webhook",
        onError: () => requestState.setError(),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isCreating ? t("setting.webhook.create-dialog.create-webhook") : t("setting.webhook.create-dialog.edit-webhook")}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="displayName">
              {t("setting.webhook.create-dialog.title")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="displayName"
              type="text"
              placeholder={t("setting.webhook.create-dialog.an-easy-to-remember-name")}
              value={state.displayName}
              onChange={handleTitleInputChange}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="url">
              {t("setting.webhook.create-dialog.payload-url")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="url"
              type="text"
              placeholder={t("setting.webhook.create-dialog.url-example-post-receive")}
              value={state.url}
              onChange={handleUrlInputChange}
            />
          </div>
          <div className="grid gap-3 border-t pt-4">
            <div className="flex items-baseline justify-between">
              <Label>{t("setting.webhook.create-dialog.filter")}</Label>
              <span className="text-xs text-muted-foreground">{t("setting.webhook.create-dialog.filter-leave-empty-for-all")}</span>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("setting.webhook.create-dialog.filter-activity-types")}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {ACTIVITY_TYPES.map((activityType) => (
                  <label key={activityType} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={state.activityTypes.includes(activityType)}
                      onCheckedChange={() => setPartialState({ activityTypes: toggleInList(state.activityTypes, activityType) })}
                    />
                    <span className="truncate" title={activityType}>
                      {activityType.replace("memos.memo.", "")}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-medium text-muted-foreground">{t("setting.webhook.create-dialog.filter-visibility")}</Label>
              <div className="flex flex-wrap gap-3">
                {VISIBILITIES.map((visibility) => (
                  <label key={visibility} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={state.visibilities.includes(visibility)}
                      onCheckedChange={() => setPartialState({ visibilities: toggleInList(state.visibilities, visibility) })}
                    />
                    <span>{visibility}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="filter-tags" className="text-xs font-medium text-muted-foreground">
                {t("setting.webhook.create-dialog.filter-tags")}
              </Label>
              <Input
                id="filter-tags"
                type="text"
                placeholder={t("setting.webhook.create-dialog.filter-tags-placeholder")}
                value={state.tagsInput}
                onChange={(e) => setPartialState({ tagsInput: e.target.value })}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={requestState.isLoading} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={requestState.isLoading} onClick={handleSaveBtnClick}>
            {isCreating ? t("common.create") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateWebhookDialog;
