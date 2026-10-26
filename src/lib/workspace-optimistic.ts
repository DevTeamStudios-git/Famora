import { modules, type ModuleKey, type WorkspaceItem } from "@/lib/workspace";

export type WorkspaceChange =
  | { type: "save"; item: WorkspaceItem }
  | { type: "delete"; id: string }
  | { type: "close"; id: string }
  | { type: "vote"; id: string; optionId: string };

export function applyWorkspaceChange(
  items: WorkspaceItem[],
  change: WorkspaceChange,
): WorkspaceItem[] {
  if (change.type === "save")
    return items.some((item) => item.id === change.item.id)
      ? items.map((item) => (item.id === change.item.id ? change.item : item))
      : [change.item, ...items];
  if (change.type === "delete")
    return items.filter((item) => item.id !== change.id);
  return items.map((item) => {
    if (item.id !== change.id) return item;
    if (change.type === "close")
      return {
        ...item,
        body: "Voting closed",
        canDelete: false,
        values: { ...item.values, __pending: true },
      };
    const multiple = item.values.isMultipleChoice === true;
    return {
      ...item,
      values: { ...item.values, __pending: true },
      options: item.options?.map((option) => {
        const mine =
          option.id === change.optionId
            ? multiple
              ? !option.mine
              : true
            : multiple
              ? option.mine
              : false;
        return {
          ...option,
          mine,
          votes: Math.max(0, option.votes + Number(mine) - Number(option.mine)),
        };
      }),
    };
  });
}

/** Immediate preview only; the guarded server action remains authoritative. */
export function previewWorkspaceItem(
  kind: ModuleKey,
  form: FormData,
  previous?: WorkspaceItem | null,
): WorkspaceItem {
  const values: WorkspaceItem["values"] = {
    ...previous?.values,
    __pending: true,
  };
  for (const field of modules[kind].fields) {
    if (field.type === "file") continue;
    values[field.name] =
      field.type === "checkbox"
        ? form.get(field.name) === "on"
        : String(form.get(field.name) ?? previous?.values[field.name] ?? "");
  }
  const file = form.get("file");
  const name = file instanceof File ? file.name : "";
  const title = String(
    values.title ||
      values.name ||
      values.question ||
      values.caption ||
      name ||
      previous?.title ||
      "New item",
  );
  const bodyFields =
    kind === "contacts"
      ? ["phone", "email", "address", "website", "notes"]
      : kind === "recipes"
        ? ["ingredients", "body"]
        : ["body", "description", "caption"];
  return {
    ...previous,
    id: previous?.id ?? `pending-${crypto.randomUUID()}`,
    title,
    body: bodyFields
      .map((key) => values[key])
      .filter(Boolean)
      .join("\n"),
    detail: "Saving…",
    values,
    canEdit: false,
    canDelete: false,
  };
}
