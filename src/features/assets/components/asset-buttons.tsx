"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import type { ItemInput, RecordInput, ContractorInput } from "../schemas";
import { ContractorForm, FormModal, ItemForm, RecordForm } from "./asset-forms";

type Option = { id: string; name: string };
type RecordProps = {
  assetId: string;
  contractors: Option[];
  accounts: Option[];
  categories: { id: string; name: string; group: string }[];
  currency: string;
  today: string;
  vehicle: boolean;
};

export function AddRecordButton(props: RecordProps) {
  return (
    <FormModal
      label={
        <>
          <PlusIcon data-icon="inline-start" /> {props.vehicle ? "Log service or repair" : "Log work"}
        </>
      }
      title={props.vehicle ? "Service or repair" : "Maintenance or improvement"}
      variant="default"
    >
      {(close) => <RecordForm {...props} onDone={close} />}
    </FormModal>
  );
}

export function EditRecordButton(props: RecordProps & { initial: Partial<RecordInput> }) {
  return (
    <FormModal label={<PencilIcon aria-label="Edit record" />} title="Edit record" variant="ghost">
      {(close) => <RecordForm {...props} onDone={close} />}
    </FormModal>
  );
}

export function AddItemButton({ assetId, currency }: { assetId: string; currency: string }) {
  return (
    <FormModal
      label={
        <>
          <PlusIcon data-icon="inline-start" /> Add item
        </>
      }
      title="Appliance or component"
    >
      {(close) => <ItemForm assetId={assetId} currency={currency} onDone={close} />}
    </FormModal>
  );
}

export function EditItemButton({ assetId, currency, initial }: { assetId: string; currency: string; initial: Partial<ItemInput> }) {
  return (
    <FormModal label={<PencilIcon aria-label={`Edit ${initial.name}`} />} title="Edit item" variant="ghost">
      {(close) => <ItemForm assetId={assetId} currency={currency} initial={initial} onDone={close} />}
    </FormModal>
  );
}

export function AddContractorButton() {
  return (
    <FormModal
      label={
        <>
          <PlusIcon data-icon="inline-start" /> Contractor
        </>
      }
      title="New contractor"
    >
      {(close) => <ContractorForm onDone={close} />}
    </FormModal>
  );
}

export function EditContractorButton({ initial }: { initial: Partial<ContractorInput> }) {
  return (
    <FormModal label={<PencilIcon aria-label={`Edit ${initial.name}`} />} title="Edit contractor" variant="ghost">
      {(close) => <ContractorForm initial={initial} onDone={close} />}
    </FormModal>
  );
}
