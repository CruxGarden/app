import { useState, useCallback } from 'react';
import { Input, Select, Textarea } from '@/components/ui';
import TemplateImageField from './TemplateImageField';
import type { FormField, FormSchema, RepeaterFormField } from '@/templates';

interface TemplateFormProps {
  schema: FormSchema;
  disabled?: boolean;
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

/**
 * Renders a form schema as editable fields.
 * Supports text, textarea, color, number, select, image, and nested repeaters.
 */
export default function TemplateForm({ schema, data, onChange, disabled }: TemplateFormProps) {
  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      <fieldset disabled={disabled} className="min-w-0 border-0 p-0 space-y-4">
        <FieldList fields={schema.fields} data={data} onChange={onChange} />
      </fieldset>
    </div>
  );
}

// ── Field list renderer ──

function FieldList({
  fields,
  data,
  onChange,
}: {
  fields: FormField[];
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}) {
  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      onChange({ ...data, [key]: value });
    },
    [data, onChange],
  );

  return (
    <>
      {fields.map((field) => (
        <FieldRenderer
          key={field.key}
          field={field}
          value={data[field.key]}
          onChange={(val) => handleFieldChange(field.key, val)}
        />
      ))}
    </>
  );
}

// ── Single field renderer ──

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case 'text':
    case 'number':
      return (
        <label className="block">
          <span className={labelClass}>{field.label}</span>
          <Input
            type={field.type === 'number' ? 'number' : 'text'}
            value={String(value ?? '')}
            placeholder={field.placeholder}
            onChange={(e) =>
              onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)
            }
            fieldSize="sm"
          />
        </label>
      );

    case 'textarea':
      return (
        <label className="block">
          <span className={labelClass}>{field.label}</span>
          <Textarea
            aria-label={field.label}
            value={String(value ?? '')}
            placeholder={field.placeholder}
            rows={3}
            onChange={(e) => onChange(e.target.value)}
            fieldSize="sm"
            className={'resize-y'}
          />
        </label>
      );

    case 'color':
      return (
        <label className="flex items-center gap-2">
          <input
            type="color"
            value={String(value ?? '#000000')}
            onChange={(e) => onChange(e.target.value)}
            className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
          />
          <span className={labelClass}>{field.label}</span>
          <span className="text-2xs font-mono text-text-muted">{String(value ?? '')}</span>
        </label>
      );

    case 'image':
      return (
        <TemplateImageField label={field.label} value={String(value ?? '')} onChange={onChange} />
      );

    case 'select':
      return (
        <label className="block">
          <span className={labelClass}>{field.label}</span>
          <Select
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            fieldSize="sm"
          >
            {'options' in field &&
              field.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
          </Select>
        </label>
      );

    case 'repeater':
      return (
        <RepeaterField
          field={field as RepeaterFormField}
          value={(Array.isArray(value) ? value : []) as Record<string, unknown>[]}
          onChange={onChange}
        />
      );

    default:
      return null;
  }
}

// ── Repeater (nested array of objects) ──

function RepeaterField({
  field,
  value,
  onChange,
}: {
  field: RepeaterFormField;
  value: Record<string, unknown>[];
  onChange: (value: unknown) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const updateItem = useCallback(
    (index: number, updated: Record<string, unknown>) => {
      const next = [...value];
      next[index] = updated;
      onChange(next);
    },
    [value, onChange],
  );

  const addItem = useCallback(() => {
    const empty: Record<string, unknown> = {};
    for (const f of field.fields) {
      empty[f.key] = f.type === 'repeater' ? [] : '';
    }
    onChange([...value, empty]);
  }, [value, onChange, field.fields]);

  const removeItem = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange],
  );

  const moveItem = useCallback(
    (index: number, dir: -1 | 1) => {
      const target = index + dir;
      if (target < 0 || target >= value.length) return;
      const next = [...value];
      const temp = next[index]!;
      next[index] = next[target]!;
      next[target] = temp;
      onChange(next);
    },
    [value, onChange],
  );

  // Derive a label for each item from its first text field
  const itemLabel = (item: Record<string, unknown>, index: number) => {
    const firstTextField = field.fields.find((f) => f.type === 'text');
    const val = firstTextField ? String(item[firstTextField.key] || '') : '';
    return val || `${field.label} ${index + 1}`;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={labelClass}>{field.label}</span>
        <button
          onClick={addItem}
          className="text-2xs font-mono text-accent hover:text-accent/80 transition-colors cursor-pointer"
        >
          + Add
        </button>
      </div>
      <div className="space-y-1">
        {value.map((item, i) => (
          <div key={i} className="border border-border rounded-[var(--radius-sm)] overflow-hidden">
            {/* Collapsible header */}
            <div className="flex items-center gap-1 px-2 py-1.5 bg-surface-solid">
              <button
                onClick={() => setCollapsed((prev) => ({ ...prev, [i]: !prev[i] }))}
                className="text-text-muted hover:text-text text-2xs w-4 cursor-pointer"
              >
                {collapsed[i] ? '\u25B6' : '\u25BC'}
              </button>
              <span className="text-xs font-mono text-text truncate flex-1">
                {itemLabel(item, i)}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => moveItem(i, -1)}
                  disabled={i === 0}
                  className="text-2xs text-text-muted hover:text-text disabled:opacity-30 px-1 cursor-pointer"
                >
                  &uarr;
                </button>
                <button
                  onClick={() => moveItem(i, 1)}
                  disabled={i === value.length - 1}
                  className="text-2xs text-text-muted hover:text-text disabled:opacity-30 px-1 cursor-pointer"
                >
                  &darr;
                </button>
                <button
                  onClick={() => removeItem(i)}
                  className="text-2xs text-error/70 hover:text-error px-1 cursor-pointer"
                >
                  &times;
                </button>
              </div>
            </div>
            {/* Fields */}
            {!collapsed[i] && (
              <div className="p-2 space-y-3">
                <FieldList
                  fields={field.fields}
                  data={item}
                  onChange={(updated) => updateItem(i, updated)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared styles ──

const labelClass = 'block text-xs font-mono text-text-muted mb-1';
