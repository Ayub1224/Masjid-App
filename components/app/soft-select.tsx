'use client';
import { Children, isValidElement, type ReactNode } from 'react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
export function SoftSelect({
  children,
  value,
  defaultValue,
  onChange,
  name,
  id,
  required = false,
  label,
  className = '',
}: {
  children: ReactNode;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  id?: string;
  required?: boolean;
  label?: string;
  className?: string;
}) {
  const options = Children.toArray(children).flatMap((child) =>
    isValidElement<{
      value?: string;
      children?: ReactNode;
      disabled?: boolean;
    }>(child)
      ? [
          {
            value:
              typeof child.props.value === 'string'
                ? child.props.value
                : typeof child.props.children === 'string'
                  ? child.props.children
                  : '',
            label: child.props.children,
            disabled: child.props.disabled,
          },
        ]
      : [],
  );
  return (
    <Select
      name={name}
      value={value}
      defaultValue={defaultValue ?? options[0]?.value}
      required={required}
      items={options}
      onValueChange={(v) => {
        if (typeof v === 'string') onChange?.(v);
      }}
    >
      <SelectTrigger
        id={id}
        aria-label={label}
        className={`soft-select min-h-11 ${className}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        align="start"
        sideOffset={10}
        className="soft-select-menu"
      >
        {options.map((o) => (
          <SelectItem
            className="min-h-11 px-3"
            key={o.value}
            value={o.value}
            disabled={o.disabled}
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
