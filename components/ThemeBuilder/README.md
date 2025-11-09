# ThemeBuilder Component

A comprehensive theme builder for creating and editing Crux Garden themes with support for both solid colors and gradients.

## Features

- 🎨 **Solid & Gradient Colors** - Primary, secondary, tertiary, and quaternary colors can be solid or gradient
- 👁️ **Live Preview** - See your theme in a CruxBloom preview
- 🎯 **Preset Colors** - Quick access to common colors and gradients
- 📝 **Full Theme Configuration** - All theme fields including UI styling
- 💾 **API Ready** - Converts to API-compatible DTO format

## Installation

The component is already part of the app. Import it from:

```tsx
import { ThemeBuilder } from '@/components/ThemeBuilder';
```

## Usage

### Basic Usage

```tsx
import { ThemeBuilder } from '@/components/ThemeBuilder';
import type { ThemeDto } from '@/components/ThemeBuilder';

function MyThemeEditor() {
  const handleSave = async (theme: ThemeDto) => {
    // Send to API
    const response = await fetch('/api/themes', {
      method: 'POST',
      body: JSON.stringify(theme),
    });
  };

  const handleCancel = () => {
    // Navigate away
    router.back();
  };

  return (
    <ThemeBuilder
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}
```

### Editing Existing Theme

```tsx
import { dtoToFormData } from '@/components/ThemeBuilder';

function EditTheme({ existingTheme }: { existingTheme: ThemeDto }) {
  const initialData = dtoToFormData(existingTheme);

  return (
    <ThemeBuilder
      initialData={initialData}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}
```

## Color System

### Solid Colors vs Gradients

The builder supports both solid hex colors and gradients for the four bloom colors:

- **Solid**: Simple hex color (e.g., `#ff0000`)
- **Gradient**: Linear gradient with multiple color stops and angle

### How Gradients Are Stored

Since the API only accepts hex colors, gradients are stored as follows:

1. The **first color stop** is saved as the hex color field
2. The **full gradient definition** is saved in the `meta.gradients` field

Example:

```typescript
// User creates a sunset gradient
primaryColor: {
  type: 'gradient',
  value: {
    id: 'sunset',
    stops: [
      { color: '#ff6b6b', offset: '0%' },
      { color: '#feca57', offset: '100%' }
    ],
    angle: 135
  }
}

// Converted to API DTO
{
  primaryColor: '#ff6b6b',  // First stop color
  meta: {
    gradients: {
      primary: {
        id: 'sunset',
        stops: [
          { color: '#ff6b6b', offset: '0%' },
          { color: '#feca57', offset: '100%' }
        ],
        angle: 135
      }
    }
  }
}
```

## Component Structure

### Files

- `index.tsx` - Main ThemeBuilder component
- `ColorPicker.tsx` - Reusable color/gradient picker
- `types.ts` - TypeScript types and conversion helpers
- `README.md` - This file

### Types

```typescript
// Form data (internal representation)
interface ThemeFormData {
  title: string;
  description?: string;
  primaryColor: ColorValue;  // Can be solid or gradient
  secondaryColor: ColorValue;
  tertiaryColor: ColorValue;
  quaternaryColor: ColorValue;
  borderRadius?: string;
  borderColor?: string;
  borderWidth?: string;
  backgroundColor?: string;
  panelColor?: string;
  textColor?: string;
  font?: string;
  mode?: string;
}

// API DTO (sent to backend)
interface ThemeDto {
  title: string;
  description?: string;
  primaryColor: string;    // Hex only
  secondaryColor: string;   // Hex only
  tertiaryColor: string;    // Hex only
  quaternaryColor: string;  // Hex only
  borderRadius?: string;
  borderColor?: string;
  borderWidth?: string;
  backgroundColor?: string;
  panelColor?: string;
  textColor?: string;
  font?: string;
  mode?: string;
  meta?: ThemeMeta;         // Gradients stored here
}
```

### Helper Functions

```typescript
// Convert form data to API DTO
formDataToDto(formData: ThemeFormData): ThemeDto

// Convert API DTO to form data
dtoToFormData(dto: ThemeDto): ThemeFormData

// Get default theme form data
getDefaultThemeFormData(): ThemeFormData
```

## ColorPicker Component

The ColorPicker supports both modes:

### Solid Mode

- Hex color input field
- Preset color swatches
- Preview circle

### Gradient Mode

- Multiple color stops (2+)
- Add/remove stops
- Adjust gradient angle (0-360°)
- Preset gradients
- Live preview in CruxBloom

### Props

```typescript
interface ColorPickerProps {
  label: string;
  value: ColorValue;
  onChange: (value: ColorValue) => void;
}
```

## Route Usage

The theme builder is available at `/theme-builder`:

```typescript
// Link to builder
<Link href="/theme-builder">Create Theme</Link>

// With params for editing
<Link href={`/theme-builder?themeId=${theme.id}`}>Edit Theme</Link>
```

## API Integration

### Required Backend Changes

The API needs to be updated to handle gradients in `meta`:

1. Update `theme.entity.ts` to include `borderColor` and `borderWidth`:

```typescript
export default class Theme {
  // ... existing fields ...
  borderColor?: string;
  borderWidth?: string;
  // ... rest of fields ...
}
```

2. Update `create-theme.dto.ts`:

```typescript
@ApiPropertyOptional({
  description: 'Border color',
  example: '#cccccc',
})
@IsOptional()
@IsString()
borderColor?: string;

@ApiPropertyOptional({
  description: 'Border width',
  example: '1px',
})
@IsOptional()
@IsString()
borderWidth?: string;
```

3. Create a migration:

```bash
cd api
npm run migrate:make add_border_fields_to_themes
```

4. Migration content:

```typescript
export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('themes', (table) => {
    table.string('border_color').nullable();
    table.string('border_width').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('themes', (table) => {
    table.dropColumn('border_color');
    table.dropColumn('border_width');
  });
}
```

### Saving a Theme

```typescript
const handleSave = async (theme: ThemeDto) => {
  const response = await fetch(`${API_URL}/themes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(theme),
  });

  if (!response.ok) {
    throw new Error('Failed to save theme');
  }

  return await response.json();
};
```

## Examples

### Solid Color Theme

```tsx
const solidTheme: ThemeFormData = {
  title: 'Ocean Blue',
  description: 'A calm blue theme',
  primaryColor: { type: 'solid', value: '#00d2ff' },
  secondaryColor: { type: 'solid', value: '#3a7bd5' },
  tertiaryColor: { type: 'solid', value: '#2563eb' },
  quaternaryColor: { type: 'solid', value: '#1d4ed8' },
};
```

### Gradient Theme

```tsx
const gradientTheme: ThemeFormData = {
  title: 'Sunset Glow',
  description: 'Warm sunset gradients',
  primaryColor: {
    type: 'gradient',
    value: {
      id: 'sunset1',
      stops: [
        { color: '#ff6b6b', offset: '0%' },
        { color: '#feca57', offset: '100%' },
      ],
      angle: 135,
    },
  },
  secondaryColor: {
    type: 'gradient',
    value: {
      id: 'sunset2',
      stops: [
        { color: '#f12711', offset: '0%' },
        { color: '#f5af19', offset: '100%' },
      ],
      angle: 90,
    },
  },
  tertiaryColor: { type: 'solid', value: '#ff8787' },
  quaternaryColor: { type: 'solid', value: '#ffa07a' },
};
```

## Preset Gradients

The ColorPicker includes these preset gradients:

- **Sunset** - Red to yellow (#ff6b6b → #feca57)
- **Ocean** - Cyan to blue (#00d2ff → #3a7bd5)
- **Forest** - Dark teal to green (#134e5e → #71b280)
- **Fire** - Red to orange (#f12711 → #f5af19)
- **Aurora** - Cyan to mint (#00c9ff → #92fe9d)
- **Lavender** - Purple to pink (#834d9b → #d04ed6)

## Future Enhancements

- [ ] Color picker with visual wheel/slider
- [ ] Import/export theme JSON
- [ ] Theme templates gallery
- [ ] Radial gradient support
- [ ] Theme preview on sample UI elements
- [ ] Dark/light mode toggle for preview
- [ ] Copy theme from existing
- [ ] Theme history/versions
