# Rule: Strict Relative Imports (No Root Aliases)

## Context

The use of `@/` or any custom root aliases (e.g., `~/*`, `#/*`) is strictly prohibited in backend code. Aliases often cause resolution failures during build steps, test execution (Jest/Vitest), or when using low-config tools like `ts-node` and `esbuild`.

## Strict Path Requirements

Every import statement MUST follow these constraints:

1. **Relative Navigation:**
* Use `./` for files in the same directory.
* Use `../` to move up the directory tree.


2. **Zero Aliasing:**
* Never use `@/` to reference the `src` or `root` directory.
* Even if a project configuration (like `tsconfig.json`) supports aliases, ignore them in favor of explicit relative paths.


3. **Automatic Refactoring:**
* When refactoring existing code, if you encounter an `@` alias, you must convert it to a relative path based on the current file's location.



## Path Calculation Logic

When determining the import string:

1. Identify the **Source File** (where the import lives).
2. Identify the **Target File** (the module being imported).
3. Calculate the steps to the common ancestor and build the `../` string.

## Standard Import Pattern

### ❌ Incorrect (Aliased)

```typescript
import { AuthService } from '@/services/auth.service';
import { db } from '@/config/database';
import { User } from '@/models/user.model';

``` cara o como 

### ✅ Correct (Strict Relative)

```typescript
// Example: If current file is at src/controllers/user/register.ts
import { AuthService } from '../../services/auth.service';
import { db } from '../../config/database';
import { User } from '../../models/user.model';

// Example: If current file is at src/services/auth.service.ts
import { db } from '../config/database';
import { User } from '../models/user.model';

```