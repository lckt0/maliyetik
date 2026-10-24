import { DIRECTION_LABELS, MetadataField } from '../types';
import { DateInput } from './DateInput';

/** Tür şemasındaki (`metadataSchema.fields`) alanları için form dizisi — UploadForm ve DocumentEditModal ortak kullanır. */
export function MetadataFieldsEditor({
  fields,
  values,
  onChange,
  fieldOptions,
}: {
  fields: MetadataField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** Alan anahtarına göre "daha önce kullanılmış" öneri listesi (ör. Z-Raporu "Fiş Grup No") — seçilebilir ama serbest metin de kabul edilir. */
  fieldOptions?: Record<string, string[]>;
}) {
  return (
    <div className="row">
      {fields.map((f) => (
        <div className="field" key={f.key}>
          <label>{f.label} {f.required && <span className="req">*</span>}</label>
          <FieldInput field={f} value={values[f.key] ?? f.default ?? ''}
            onChange={(v) => onChange(f.key, v)} options={fieldOptions?.[f.key]} />
        </div>
      ))}
    </div>
  );
}

export function FieldInput({ field, value, onChange, options }: {
  field: MetadataField;
  value: string;
  onChange: (v: string) => void;
  /** Serbest metin alanı için "var olandan seç" önerileri (datalist). */
  options?: string[];
}) {
  if (field.type === 'enum') {
    return (
      <select value={value} required={field.required} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options?.map((o) => <option key={o} value={o}>{DIRECTION_LABELS[o] ?? o}</option>)}
      </select>
    );
  }
  if (field.type === 'date') {
    return <DateInput value={value} onChange={onChange} required={field.required} />;
  }
  const type = field.type === 'decimal' ? 'number' : 'text';
  if (options?.length) {
    const listId = `field-options-${field.key}`;
    return (
      <>
        <input type={type} step={field.type === 'decimal' ? '0.01' : undefined} required={field.required}
          value={value} onChange={(e) => onChange(e.target.value)} list={listId} />
        <datalist id={listId}>
          {options.map((o) => <option key={o} value={o} />)}
        </datalist>
      </>
    );
  }
  return <input type={type} step={field.type === 'decimal' ? '0.01' : undefined} required={field.required}
    value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function coerceMetadata(fields: MetadataField[], meta: Record<string, string>) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = meta[f.key];
    if (v === undefined || v === '') continue;
    out[f.key] = f.type === 'decimal' ? Number(v) : v;
  }
  return out;
}

/** Var olan bir evrağın metadata'sını forma önceden doldurmak için string map'e çevirir. */
export function metadataToFormValues(fields: MetadataField[], metadata: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = metadata?.[f.key];
    if (v === undefined || v === null) continue;
    out[f.key] = String(v);
  }
  return out;
}
