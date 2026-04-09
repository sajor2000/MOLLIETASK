# Design System: The Silent Editor

## 1. Overview & Creative North Star
**Creative North Star: "The Digital Sanctuary"**

This design system is an exercise in restraint. It moves beyond the utilitarian nature of standard "dark mode" into a space of high-end, editorial stillness. Inspired by Scandinavian design principles—functionality, simplicity, and craftsmanship—and the structural logic of professional productivity tools, this system prioritizes the user's content above the interface itself.

We break the "template" look by rejecting traditional shadows and heavy separators. Instead, we use **Tonal Recession**: a method where hierarchy is built through the strategic layering of dark, desaturated surfaces. The result is an interface that feels carved out of a single block of stone—monolithic, intentional, and quiet.

---

## 2. Colors: Tonal Architecture
The palette is rooted in deep charcoals and muted teals. We avoid pure blacks to maintain a "printed" feel, ensuring the screen feels like high-quality matte paper rather than a void.

### Surface Hierarchy & Nesting
Depth is achieved through the **"Inward Step"** principle. As a user moves deeper into a task (e.g., from a dashboard to a specific document to a modal), the background color shifts slightly lighter to bring the focus "closer."

*   **Foundation (`surface_dim` / `#0c0e0f`):** The canvas. Used for the outermost app shell.
*   **The Work Surface (`surface_container` / `#161a1c`):** The primary area for content interaction.
*   **The Elevated Layer (`surface_container_highest` / `#212729`):** Reserved for active elements like selected items or hovered states.

### The "No-Line" Rule
Standard UI relies on 1px lines to separate sections. In this system, **explicit lines are a failure of layout.** Sectioning must be achieved through:
1.  **Background Shifts:** A `surface_container_low` sidebar sitting against a `surface` background.
2.  **Negative Space:** Using the spacing scale to create clear mental groupings.

### Signature Accents
*   **Primary (`#9fced9`):** A desaturated glacial blue. Use sparingly for critical actions or active indicators.
*   **Secondary (`#82a4a9`):** Used for supporting information to keep the interface "low-contrast" and easy on the eyes during long sessions.

---

## 3. Typography: The Editorial Grid
Typography is the primary architecture. By using a restricted set of weights (400/500) and sizes, we force a hierarchy based on **rhythm and space** rather than bold splashes of color.

*   **Display & Headline:** Use `headline-sm` (`1.5rem`) for primary views. The goal is to feel like a high-end magazine, not a marketing site.
*   **Body & Title:** The core of the experience resides in `body-md` (`0.875rem`) and `title-sm` (`1rem`). These sizes mimic the legibility of a well-set book.
*   **Labeling:** `label-sm` (`0.6875rem`) should be used for metadata. In this system, metadata is "whispered"—it's there if needed, but doesn't compete for attention.

**Weight Rule:** Never use Bold (700+). Use Medium (500) to distinguish titles from body text. If you cannot distinguish elements without a heavy weight, increase the spacing.

---

## 4. Elevation & Depth: Tonal Layering
We reject the drop-shadow. Instead, we use light and opacity to define "up."

*   **The Layering Principle:** Stack containers from darkest (bottom) to lightest (top). A card should never be darker than the section it sits on.
*   **The "Ghost Border" Fallback:** While we prioritize tonal shifts, a "Ghost Border" may be used for interactive elements (like input fields). Use `outline_variant` at **15% opacity**. It should be felt, not seen.
*   **Glassmorphism:** For floating menus or navigation bars, use `surface_container` with a `20px` backdrop-blur and `80%` opacity. This ensures the content "belongs" to the space it covers.

---

## 5. Components: Functional Primitives

### Buttons
*   **Primary:** Background `primary`, text `on_primary`. No border. 4px radius. 
*   **Secondary:** Background `surface_container_high`, text `on_surface`. 1px ghost border.
*   **Tertiary:** Text only (`primary`). Use for low-emphasis actions.

### Cards & Lists
*   **The No-Divider Rule:** Forbid 1px dividers between list items. Use 8px to 12px of vertical padding to separate items.
*   **Interactions:** On hover, a list item should shift from `surface_container` to `surface_container_high`.

### Input Fields
*   **Default State:** `surface_container_low` background with a 1px ghost border (`outline_variant` @ 10%). 
*   **Focus State:** The border opacity increases to 100%, or the border color transitions to `primary`. No "glow" or outer shadow.

### Chips
*   Compact, 4px radius, using `surface_container_highest` with `label-md` text. They should feel like small physical tabs.

---

## 6. Do's and Don'ts

### Do:
*   **Embrace Asymmetry:** Align text-heavy blocks to a grid, but allow for wide margins on one side to create an "editorial" breathing room.
*   **Use Subtle Transitions:** All hover states and color shifts should have a `200ms ease-in-out` duration. Movement should feel "weighted."
*   **Respect the 4px Radius:** Every corner must be consistent to maintain the architectural "squareness" of the Scandinavian vibe.

### Don't:
*   **Don't use Shadows:** Shadows introduce a "web-standard" look that breaks the sanctuary vibe.
*   **Don't use Decorative Flourishes:** No icons that don't serve a functional purpose. No gradients that aren't functional.
*   **Don't Over-Contrast:** If a piece of text feels too bright, use `on_surface_variant` (muted grey) instead of `on_surface` (near-white). We want a "low-contrast" hierarchy to reduce eye strain.