# App Interface Feature Plan

## Goal

To build a high-quality, premium login interface and an access-restricted Dashboard UI for authenticated users. The backend uses Prisma and PostgreSQL.

## User Review Required

> [!IMPORTANT]
> Please review this updated plan. As per your "HARD RULE", no implementation will begin until you explicitly say "start implementing".

## Decisions Made

- **Tech Stack:** Vanilla HTML, CSS, and JS for a custom, premium design.
- **Serving the UI:** The Express backend will serve the UI (the HTML files) when a user hits specific API endpoints (e.g., `GET /login` and `GET /dashboard`).
- **Token Storage:** `localStorage` (defaulting to this for client-side API usage).
- **Authentication:** JWT-based.
- **Data Scope:** API Keys and Prompts are global settings (no relationship to the `User` table).
- **Prompt Capabilities:** Users can view, create, edit, and delete prompts.

## Database Schema Changes

The project uses Prisma ORM with PostgreSQL. The `prisma/schema.prisma` will be updated:

**1. `User` Model Updates:**

- Add `username` (`String @unique`)
- Add `password` (`String` - will store the hashed password)

**2. New `ApiKey` Model:**

- `id` (`String @id @default(uuid())`)
- `category` (`String` - enum values: 'Ollama API', 'other')
- `apiKey` (`String`)
- `subjectName` (`String`)
- `createdAt` (`DateTime @default(now())`)

**3. New `Prompt` Model:**

- `id` (`String @id @default(uuid())`)
- `promptName` (`String @unique`)
- `promptValue` (`String`)

_(After schema updates, a database migration will be run to apply these changes)._

## Edge Cases & Logic Analysis

I have thoroughly analyzed the plan and identified the following edge cases and potential miscalculations that we must account for during implementation:

**1. Prisma Migration for Existing Data:**

- _Miscalculation Risk:_ Adding a required, unique `username` field to the `User` model will cause the Prisma migration to fail if there are existing users in the database (since they won't have a username).
- _Solution:_ During implementation, we must either clear the `User` table (if in dev), provide a default, or make the field optional temporarily.

**2. API Key Security & "Edit" Semantics:**

- _Miscalculation Risk:_ Allowing users to "Edit" the actual `apiKey` string is a security anti-pattern.
- _Solution:_ The UI's "Edit" functionality for API Keys will be strictly limited to updating the metadata (`subjectName` and `category`). The actual `apiKey` string will be read-only after creation.

**3. Session Expiry & 401 Unauthorized Handling:**

- _Miscalculation Risk:_ If the JWT expires while the user is on the Dashboard, API calls will fail, potentially leaving the UI in a broken state.
- _Solution:_ `dashboard.js` must globally intercept `401 Unauthorized` responses, clear the token from `localStorage`, and redirect the user to `/login`.

**4. "Already Logged In" Redirection:**

- _Miscalculation Risk:_ A user with a valid JWT navigating to `/login` manually would see the login screen again.
- _Solution:_ `login.js` must check `localStorage` on load and automatically redirect to `/dashboard` if a token is present.

**5. Database Unique Constraints:**

- _Miscalculation Risk:_ Trying to create a prompt with an existing `promptName` will throw a backend error.
- _Solution:_ The UI must anticipate this and display a user-friendly error (e.g., "Prompt name already exists") without breaking the layout.

**6. Mobile Responsiveness on Dashboard:**

- _Miscalculation Risk:_ A fixed sidebar menu might break the UI on mobile devices.
- _Solution:_ The CSS must include a responsive hamburger menu or collapsible sidebar for the Dashboard.

## Proposed Architecture

The `src/admin-app/view` directory will contain the following files:

### 1. Login Interface

- `index.html`: The premium login page (Email/Username and Password).
- `login.js`: Handles form submission, receives the JWT, stores it, and redirects to the Dashboard.

### 2. Dashboard Interface (Access Restricted)

- `dashboard.html`: The main restricted UI. Includes a sidebar menu with two main sections:
  1. **API Keys Settings:** A datatable showing subject name, category, and API key. Includes buttons to Create, Edit, and Delete keys.
  2. **Prompt Settings:** A datatable showing prompt name and value. Includes buttons to Create, Edit, and Delete prompts.
- `dashboard.js`:
  - On page load, verifies the JWT exists; redirects to login if not.
  - Fetches API keys and Prompts from the backend APIs (using the `Bearer <token>`).
  - Handles UI rendering (toggling between the two menu views).
  - Handles Create/Edit/Delete API requests for both API Keys and Prompts.

### 3. Shared Assets

- `styles.css`: A global premium, dynamic design aesthetic used by both Login and Dashboard. Features modern typography, harmonious colors, glassmorphism, and micro-animations.

## Backend API Implementation (Pending)

To make the frontend UI fully functional, the following Express API routes and middleware must be implemented:

### 1. Authentication API

- **`POST /api/auth/login`**:
  - Validates `identifier` (username/email) and `password` against the Prisma `User` table.
  - Verifies the password hash.
  - Generates and returns a JSON Web Token (`{ token: "your_jwt_string" }`).

### 2. JWT Middleware (Auth Guard)

- A reusable Express middleware function that checks incoming API requests for the `Authorization: Bearer <token>` header.
- Verifies the token and returns a `401 Unauthorized` status if the token is missing or invalid. This will protect the routes below.

### 3. API Keys Management (Protected by Auth Guard)

- **`GET /api/apikeys`**: Fetch all API keys from the database.
- **`POST /api/apikeys`**: Accept payload (`subjectName`, `category`, `apiKey`), save it to the database, and return the new record.
- **`PUT /api/apikeys/:id`**: Update the `subjectName` and `category` of a specific API key.
- **`DELETE /api/apikeys/:id`**: Delete a specific API key by its ID.

### 4. Prompts Management (Protected by Auth Guard)

- **`GET /api/prompts`**: Fetch all prompts from the database.
- **`POST /api/prompts`**: Accept payload (`promptName`, `promptValue`), enforce the unique constraint (return a 400 error if it already exists), and save it.
- **`PUT /api/prompts/:id`**: Update the name or value of a specific prompt.
- **`DELETE /api/prompts/:id`**: Delete a specific prompt by its ID.
