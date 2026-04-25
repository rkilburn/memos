import { create } from "@bufbuild/protobuf";
import { isEqual } from "lodash-es";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { useInstance } from "@/contexts/InstanceContext";
import { handleError } from "@/lib/error";
import {
  InstanceSetting_Key,
  InstanceSetting_StorageSetting,
  InstanceSetting_StorageSetting_AzureBlobConfig,
  InstanceSetting_StorageSetting_AzureBlobConfigSchema,
  InstanceSetting_StorageSetting_S3Config,
  InstanceSetting_StorageSetting_S3ConfigSchema,
  InstanceSetting_StorageSetting_StorageType,
  InstanceSetting_StorageSettingSchema,
  InstanceSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";
import { useTranslate } from "@/utils/i18n";
import SettingGroup from "./SettingGroup";
import SettingRow from "./SettingRow";
import SettingSection from "./SettingSection";

const StorageSection = () => {
  const t = useTranslate();
  const { storageSetting: originalSetting, updateSetting, fetchSetting } = useInstance();
  const [instanceStorageSetting, setInstanceStorageSetting] = useState<InstanceSetting_StorageSetting>(originalSetting);

  useEffect(() => {
    setInstanceStorageSetting(originalSetting);
  }, [originalSetting]);

  const allowSaveStorageSetting = useMemo(() => {
    if (instanceStorageSetting.uploadSizeLimitMb <= 0) {
      return false;
    }

    if (instanceStorageSetting.storageType === InstanceSetting_StorageSetting_StorageType.LOCAL) {
      if (instanceStorageSetting.filepathTemplate.length === 0) {
        return false;
      }
    } else if (instanceStorageSetting.storageType === InstanceSetting_StorageSetting_StorageType.S3) {
      if (
        instanceStorageSetting.s3Config?.accessKeyId.length === 0 ||
        instanceStorageSetting.s3Config?.accessKeySecret.length === 0 ||
        instanceStorageSetting.s3Config?.endpoint.length === 0 ||
        instanceStorageSetting.s3Config?.region.length === 0 ||
        instanceStorageSetting.s3Config?.bucket.length === 0
      ) {
        return false;
      }
    } else if (instanceStorageSetting.storageType === InstanceSetting_StorageSetting_StorageType.AZURE_BLOB) {
      // The account key is write-only and never returned by the API, so leaving
      // it blank is allowed when editing an existing Azure Blob configuration
      // (the server preserves the previously stored key on update). Require a
      // key only when switching from another storage type for the first time.
      const wasAlreadyAzureBlob = originalSetting.storageType === InstanceSetting_StorageSetting_StorageType.AZURE_BLOB;
      if (
        !instanceStorageSetting.azureBlobConfig?.accountName ||
        (!wasAlreadyAzureBlob && !instanceStorageSetting.azureBlobConfig?.accountKey) ||
        !instanceStorageSetting.azureBlobConfig?.container
      ) {
        return false;
      }
    }
    return !isEqual(originalSetting, instanceStorageSetting);
  }, [instanceStorageSetting, originalSetting]);

  const handleMaxUploadSizeChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    let num = parseInt(event.target.value);
    if (Number.isNaN(num)) {
      num = 0;
    }
    setInstanceStorageSetting(
      create(InstanceSetting_StorageSettingSchema, {
        ...instanceStorageSetting,
        uploadSizeLimitMb: BigInt(num),
      }),
    );
  };

  const handleFilepathTemplateChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInstanceStorageSetting(
      create(InstanceSetting_StorageSettingSchema, {
        ...instanceStorageSetting,
        filepathTemplate: event.target.value,
      }),
    );
  };

  const handleS3FieldChange = (field: keyof InstanceSetting_StorageSetting_S3Config, value: string | boolean) => {
    const existing = instanceStorageSetting.s3Config;
    setInstanceStorageSetting(
      create(InstanceSetting_StorageSettingSchema, {
        storageType: instanceStorageSetting.storageType,
        filepathTemplate: instanceStorageSetting.filepathTemplate,
        uploadSizeLimitMb: instanceStorageSetting.uploadSizeLimitMb,
        s3Config: create(InstanceSetting_StorageSetting_S3ConfigSchema, {
          accessKeyId: existing?.accessKeyId ?? "",
          accessKeySecret: existing?.accessKeySecret ?? "",
          endpoint: existing?.endpoint ?? "",
          region: existing?.region ?? "",
          bucket: existing?.bucket ?? "",
          usePathStyle: existing?.usePathStyle ?? false,
          [field]: value,
        }),
      }),
    );
  };

  const handleAzureBlobFieldChange = (field: keyof InstanceSetting_StorageSetting_AzureBlobConfig, value: string) => {
    const existing = instanceStorageSetting.azureBlobConfig;
    setInstanceStorageSetting(
      create(InstanceSetting_StorageSettingSchema, {
        storageType: instanceStorageSetting.storageType,
        filepathTemplate: instanceStorageSetting.filepathTemplate,
        uploadSizeLimitMb: instanceStorageSetting.uploadSizeLimitMb,
        azureBlobConfig: create(InstanceSetting_StorageSetting_AzureBlobConfigSchema, {
          accountName: existing?.accountName ?? "",
          accountKey: existing?.accountKey ?? "",
          container: existing?.container ?? "",
          endpoint: existing?.endpoint ?? "",
          [field]: value,
        }),
      }),
    );
  };

  const handleStorageTypeChanged = (storageType: InstanceSetting_StorageSetting_StorageType) => {
    setInstanceStorageSetting(
      create(InstanceSetting_StorageSettingSchema, {
        ...instanceStorageSetting,
        storageType,
      }),
    );
  };

  const saveInstanceStorageSetting = async () => {
    try {
      await updateSetting(
        create(InstanceSettingSchema, {
          name: `instance/settings/${InstanceSetting_Key[InstanceSetting_Key.STORAGE]}`,
          value: {
            case: "storageSetting",
            value: instanceStorageSetting,
          },
        }),
      );
      await fetchSetting(InstanceSetting_Key.STORAGE);
      toast.success(t("message.update-succeed"));
    } catch (error: unknown) {
      handleError(error, toast.error, {
        context: "Update storage settings",
      });
    }
  };

  return (
    <SettingSection title={t("setting.storage.label")}>
      <SettingGroup title={t("setting.storage.current-storage")}>
        <div className="w-full">
          <RadioGroup
            value={String(instanceStorageSetting.storageType)}
            onValueChange={(value) => {
              handleStorageTypeChanged(Number(value) as InstanceSetting_StorageSetting_StorageType);
            }}
            className="flex flex-row gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={String(InstanceSetting_StorageSetting_StorageType.DATABASE)} id="database" />
              <Label htmlFor="database">{t("setting.storage.type-database")}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={String(InstanceSetting_StorageSetting_StorageType.LOCAL)} id="local" />
              <Label htmlFor="local">{t("setting.storage.type-local")}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={String(InstanceSetting_StorageSetting_StorageType.S3)} id="s3" />
              <Label htmlFor="s3">S3</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={String(InstanceSetting_StorageSetting_StorageType.AZURE_BLOB)} id="azure-blob" />
              <Label htmlFor="azure-blob">Azure Blob</Label>
            </div>
          </RadioGroup>
        </div>

        <SettingRow label={t("setting.system.max-upload-size")} tooltip={t("setting.system.max-upload-size-hint")}>
          <Input
            className="w-24 font-mono"
            value={String(instanceStorageSetting.uploadSizeLimitMb)}
            onChange={handleMaxUploadSizeChanged}
          />
        </SettingRow>

        {instanceStorageSetting.storageType !== InstanceSetting_StorageSetting_StorageType.DATABASE && (
          <SettingRow label={t("setting.storage.filepath-template")}>
            <Input
              className="w-64"
              value={instanceStorageSetting.filepathTemplate}
              placeholder="assets/{timestamp}_{filename}"
              onChange={handleFilepathTemplateChanged}
            />
          </SettingRow>
        )}
      </SettingGroup>

      {instanceStorageSetting.storageType === InstanceSetting_StorageSetting_StorageType.S3 && (
        <SettingGroup title="S3 Configuration" showSeparator>
          <SettingRow label={t("setting.storage.accesskey")}>
            <Input
              className="w-64"
              value={instanceStorageSetting.s3Config?.accessKeyId}
              onChange={(e) => handleS3FieldChange("accessKeyId", e.target.value)}
            />
          </SettingRow>

          <SettingRow label={t("setting.storage.secretkey")}>
            <Input
              className="w-64"
              type="password"
              value={instanceStorageSetting.s3Config?.accessKeySecret}
              onChange={(e) => handleS3FieldChange("accessKeySecret", e.target.value)}
            />
          </SettingRow>

          <SettingRow label={t("setting.storage.endpoint")}>
            <Input
              className="w-64"
              value={instanceStorageSetting.s3Config?.endpoint}
              onChange={(e) => handleS3FieldChange("endpoint", e.target.value)}
            />
          </SettingRow>

          <SettingRow label={t("setting.storage.region")}>
            <Input
              className="w-64"
              value={instanceStorageSetting.s3Config?.region}
              onChange={(e) => handleS3FieldChange("region", e.target.value)}
            />
          </SettingRow>

          <SettingRow label={t("setting.storage.bucket")}>
            <Input
              className="w-64"
              value={instanceStorageSetting.s3Config?.bucket}
              onChange={(e) => handleS3FieldChange("bucket", e.target.value)}
            />
          </SettingRow>

          <SettingRow label="Use Path Style">
            <Switch
              checked={instanceStorageSetting.s3Config?.usePathStyle}
              onCheckedChange={(checked) => handleS3FieldChange("usePathStyle", checked)}
            />
          </SettingRow>
        </SettingGroup>
      )}

      {instanceStorageSetting.storageType === InstanceSetting_StorageSetting_StorageType.AZURE_BLOB && (
        <SettingGroup title="Azure Blob Storage Configuration" showSeparator>
          <SettingRow label={t("setting.storage.azure-blob-account")}>
            <Input
              className="w-64"
              value={instanceStorageSetting.azureBlobConfig?.accountName ?? ""}
              onChange={(e) => handleAzureBlobFieldChange("accountName", e.target.value)}
            />
          </SettingRow>

          <SettingRow label={t("setting.storage.azure-blob-key")}>
            <Input
              className="w-64"
              type="password"
              value={instanceStorageSetting.azureBlobConfig?.accountKey ?? ""}
              onChange={(e) => handleAzureBlobFieldChange("accountKey", e.target.value)}
            />
          </SettingRow>

          <SettingRow label={t("setting.storage.azure-blob-container")}>
            <Input
              className="w-64"
              value={instanceStorageSetting.azureBlobConfig?.container ?? ""}
              onChange={(e) => handleAzureBlobFieldChange("container", e.target.value)}
            />
          </SettingRow>

          <SettingRow label={t("setting.storage.azure-blob-endpoint")}>
            <Input
              className="w-64"
              placeholder="https://{account}.blob.core.windows.net"
              value={instanceStorageSetting.azureBlobConfig?.endpoint ?? ""}
              onChange={(e) => handleAzureBlobFieldChange("endpoint", e.target.value)}
            />
          </SettingRow>
        </SettingGroup>
      )}

      <div className="w-full flex justify-end">
        <Button disabled={!allowSaveStorageSetting} onClick={saveInstanceStorageSetting}>
          {t("common.save")}
        </Button>
      </div>
    </SettingSection>
  );
};

export default StorageSection;
