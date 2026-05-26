import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

interface State {
  displayName: string;
  url: string;
  memoFilter: string;
}

function CreateWebhookDialog({ open, onOpenChange, webhookName, onSuccess }: Props) {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const [state, setState] = useState<State>({
    displayName: "",
    url: "",
    memoFilter: "",
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
              memoFilter: webhook.memoFilter,
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

    const memoFilter = state.memoFilter.trim();

    try {
      requestState.setLoading();
      if (isCreating) {
        await userServiceClient.createUserWebhook({
          parent: currentUser.name,
          webhook: {
            displayName: state.displayName,
            url: state.url,
            memoFilter,
          },
        });
      } else {
        await userServiceClient.updateUserWebhook({
          webhook: {
            name: webhookName,
            displayName: state.displayName,
            url: state.url,
            memoFilter,
          },
          updateMask: create(FieldMaskSchema, { paths: ["display_name", "url", "memo_filter"] }),
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
          <div className="grid gap-2">
            <Label htmlFor="memoFilter">{t("setting.webhook.create-dialog.memo-filter")}</Label>
            <Textarea
              id="memoFilter"
              rows={2}
              placeholder={t("setting.webhook.create-dialog.memo-filter-placeholder")}
              value={state.memoFilter}
              onChange={(e) => setPartialState({ memoFilter: e.target.value })}
              className="font-mono text-sm"
            />
            <span className="text-xs text-muted-foreground">{t("setting.webhook.create-dialog.memo-filter-help")}</span>
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
