# Crossover References

- [1. Overview](#1-overview)
- [2. Installation](#2-installation)
- [3. Configuration](#3-configuration)
  - [3.1. Schema](#31-schema)
  - [3.2. Nesting](#32-nesting)
- [4. Usage](#4-usage)
- [5. Development](#5-development)
  - [5.1. Prerequisites](#51-prerequisites)
  - [5.2. Build](#52-build)
  - [5.3. Run](#53-run)
  - [5.4. Test](#54-test)
  - [5.5. Project Structure](#55-project-structure)

## 1. Overview

A VS Code extension that provides cross-references between corresponding type definitions in different programming languages.
When you use "Go to References" on a type or its fields in one language, the extension also shows references from the corresponding type in other languages in your workspace.

This is intended for projects with, for example, Rust and TypeScript code, where Rust types are serialized to JSON and deserialized in TypeScript, or vice versa.

## 2. Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=xq-Tec.x-over), or build from source (see Development).

## 3. Configuration

Add a `cross-reference.json` file to your project to define mappings between symbols in different components.
The extension activates when it finds this file in your workspace.

### 3.1. Schema

```json
{
  "mappings": [
    {
      "@rust": { "file": "rust/src/types.rs", "symbol": "User" },
      "@ts": { "file": "typescript/src/types.ts", "symbol": "UserData" },
      "children": [
        { "@rust": "id", "@ts": "id" },
        { "@rust": "name", "@ts": "name" },
        { "@rust": "company_email", "@ts": "companyEmail" }
      ]
    }
  ]
}
```

- **mappings**: Array of mapping entries.
- Each entry is a map with keys starting with `@` (e.g. `@rust`, `@ts`, `@client`, `@backend`). These identify project components.
- **Component entries**: `{ "file": "path/to/file", "symbol": "TypeName" }`. Paths are relative to the config file's directory.
- **children** (optional): Array of field mappings. Each child maps component keys to field names, e.g. `{ "@rust": "company_email", "@ts": "companyEmail" }`.
- Each mapping can define more than two components.

### 3.2. Nesting

You can place multiple `cross-reference.json` files in different directories.
Each config may only refer to source files in its own directory or subdirectories.
For example, `a/b/cross-reference.json` may only reference files under `a/b/`.
Paths that escape upward (e.g. `../other/file.rs`) are ignored.

A config's responsibility ends where another config is found.
If both `a/cross-reference.json` and `a/b/c/cross-reference.json` exist, the higher-level config covers all of `a/` except `a/b/c/`.
References in `a/cross-reference.json` to files under `a/b/c/` are ignored; those files are covered by the nested config.

## 4. Usage

1. Add a `cross-reference.json` file to your project.
2. Open a file that is part of a mapping.
3. Place the cursor on a type or field name.
4. Run "Go to References" (Shift+F12). The results include references from the corresponding symbols in other components.

## 5. Development

### 5.1. Prerequisites

- Node.js
- npm

### 5.2. Build

```bash
npm install
npm run compile
```

### 5.3. Run

1. Open the project in VS Code.
2. Press F5 or use Run > Start Debugging.

### 5.4. Test

```bash
npm test
```

### 5.5. Project Structure

```plain
x-over/
├── src/
│   ├── extension.ts      # Entry point
│   ├── configLoader.ts   # Parses cross-reference.json
│   ├── configScope.ts    # Config file scope and nesting rules
│   ├── symbolResolver.ts # Resolves symbols via DocumentSymbolProvider
│   ├── mappingIndex.ts   # Builds counterpart mappings
│   └── referenceProvider.ts
├── example/              # Sample project for testing
│   ├── rust/
│   ├── typescript/
│   └── cross-reference.json
└── package.json
```
