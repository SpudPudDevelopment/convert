# CSS Architecture Guide

This document outlines the new CSS architecture designed to prevent duplicate classes and maintain consistency across the application.

## 🏗️ Architecture Overview

```
src/styles/
├── base/           # Foundation styles
│   ├── variables.css    # CSS variables and design tokens
│   └── reset.css        # CSS reset and base styles
├── components/     # Reusable component styles
│   └── buttons.css      # Button component styles
├── utilities/      # Utility classes
│   └── spacing.css      # Spacing utility classes
├── layout/         # Layout-specific styles
├── themes/         # Theme variations
└── index.css       # Main entry point
```

## 🎯 Key Principles

### 1. **Single Source of Truth**
- All design tokens (colors, spacing, typography) are defined in `variables.css`
- No hardcoded values in component styles
- Use CSS variables for all design decisions

### 2. **Component-First Approach**
- Each component has its own CSS file
- Components use utility classes and variables
- No duplicate component styles across files

### 3. **Utility-First for Common Patterns**
- Spacing, typography, and layout utilities
- Consistent spacing scale using variables
- Reusable across all components

### 4. **Import Order Matters**
- Variables first (for other files to use)
- Reset second (base styles)
- Utilities third (common patterns)
- Components last (specific implementations)

## 🚀 Usage Guidelines

### Adding New Styles

#### 1. **New Component**
```css
/* src/styles/components/new-component.css */
.new-component {
  padding: var(--space-4);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}
```

#### 2. **New Utility Class**
```css
/* src/styles/utilities/new-utility.css */
.text-center { text-align: center; }
.text-left { text-align: left; }
.text-right { text-align: right; }
```

#### 3. **Import in index.css**
```css
/* src/styles/index.css */
@import './components/new-component.css';
@import './utilities/new-utility.css';
```

### Using Variables

#### Colors
```css
.my-component {
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}
```

#### Spacing
```css
.my-component {
  padding: var(--space-4);
  margin: var(--space-6);
  gap: var(--space-2);
}
```

#### Typography
```css
.my-component {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
}
```

#### Shadows & Borders
```css
.my-component {
  box-shadow: var(--shadow-md);
  border-radius: var(--radius-lg);
}
```

## 🔧 Migration Guide

### From Old CSS to New Architecture

#### Before (Old way - causes duplicates):
```css
/* Multiple files defining the same styles */
.btn-primary {
  background: #3b82f6;
  padding: 16px;
  border-radius: 8px;
}

/* Another file */
.btn-primary {
  background: #2563eb;
  padding: 1rem;
  border-radius: 0.5rem;
}
```

#### After (New way - single source):
```css
/* src/styles/components/buttons.css */
.btn-primary {
  background: var(--accent-color);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
}
```

### Updating Component Imports

#### Old way:
```javascript
import './OldComponent.css';  // ❌ Duplicate styles
```

#### New way:
```javascript
// No CSS import needed - styles are global
// Component uses utility classes and variables
```

## 📋 Component Style Guidelines

### 1. **Use Utility Classes First**
```jsx
// ✅ Good - uses utilities
<div className="p-4 m-2 bg-secondary rounded-lg">
  Content
</div>

// ❌ Bad - custom CSS for common patterns
<div className="custom-padding custom-margin custom-bg custom-radius">
  Content
</div>
```

### 2. **Use Variables for Values**
```css
/* ✅ Good - uses variables */
.custom-component {
  padding: var(--space-6);
  color: var(--text-secondary);
}

/* ❌ Bad - hardcoded values */
.custom-component {
  padding: 24px;
  color: #64748b;
}
```

### 3. **Component-Specific Styles**
```css
/* ✅ Good - specific to component */
.file-upload-zone {
  border: 2px dashed var(--border-color);
  background: var(--bg-tertiary);
}

/* ❌ Bad - generic styles that could be utilities */
.file-upload-zone {
  border: 2px dashed #cbd5e1;
  background: #e2e8f0;
}
```

## 🚫 Anti-Patterns to Avoid

### 1. **Don't Duplicate Component Styles**
```css
/* ❌ Don't do this - causes conflicts */
/* File 1 */
.btn { background: blue; }

/* File 2 */
.btn { background: red; }
```

### 2. **Don't Hardcode Values**
```css
/* ❌ Don't do this - use variables */
.component {
  margin: 20px;
  color: #333;
}

/* ✅ Do this instead */
.component {
  margin: var(--space-5);
  color: var(--text-primary);
}
```

### 3. **Don't Create Utilities for One-Off Use**
```css
/* ❌ Don't do this - too specific */
.special-margin-for-header {
  margin: 24px 16px;
}

/* ✅ Do this instead - use existing utilities */
.header {
  margin: var(--space-6) var(--space-4);
}
```

## 🔍 Debugging Duplicates

### Check for Duplicates
```bash
# Find duplicate class definitions
grep -r "^\.[a-zA-Z][a-zA-Z0-9_-]*\s*{" src --include="*.css" | \
  sed 's/^.*\.//' | sed 's/\s*{.*$//' | sort | uniq -d
```

### Check for Unused Classes
```bash
# Find defined but unused classes
grep -r "^\.[a-zA-Z][a-zA-Z0-9_-]*\s*{" src --include="*.css" | \
  sed 's/^.*\.//' | sed 's/\s*{.*$//' | sort | uniq > defined.txt

grep -r "className=" src --include="*.js" | \
  grep -o 'className="[^"]*"' | sed 's/className="//' | \
  sed 's/"//' | tr ' ' '\n' | sort | uniq > used.txt

comm -23 defined.txt used.txt
```

## 📚 Resources

- [CSS Custom Properties (Variables)](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)
- [CSS Architecture Best Practices](https://css-tricks.com/css-architecture/)
- [Utility-First CSS](https://tailwindcss.com/docs/utility-first)

## 🤝 Contributing

When adding new styles:

1. **Check if a utility class already exists**
2. **Use variables instead of hardcoded values**
3. **Follow the import order in index.css**
4. **Document any new design tokens in variables.css**
5. **Test that no duplicates are created**

Remember: **One style, one place, one truth!**
