# Tutorials

Two kinds of walkthrough on one page:

- **[Getting started: your first deck](#getting-started-your-first-deck)** — the
  whole loop end to end (open, edit, insert, position, export) in about fifteen
  minutes.
- **Feature tutorials** — short, focused, step-by-step guides for specific core
  features: [masking & cropping images](#masking--cropping-images),
  [shadows & effects](#adding-shadows--effects), and
  [styling tables](#styling-tables). More will be added over time.

For a reference-style rundown of every feature, see the [user guide](USAGE.md).

> **Setup:** if the app isn't running yet, do `npm install` then `npm run dev`
> and open <http://localhost:5173>. To edit your own folder of talks, see
> [Choosing a workspace folder](USAGE.md#choosing-a-workspace-folder).

---

# Getting started: your first deck

A hands-on walkthrough. By the end you'll have opened a deck, edited its text,
added a table, a chart and a shape, positioned things, and exported the result.

## 1. Pick a deck

The first screen lists every reveal.js deck in your workspace, with its title,
slide count and when it was last changed.

![The deck list](images/deck-list.png)

Click a deck to open it, or **New presentation** to start from a template
(you'll choose a title, theme and slide size). Follow along with any deck you
like — the steps below are the same for all of them.

## 2. Get your bearings

The editor has four areas:

![The editor](images/editor-overview.png)

- **Sorter** (left) — every slide as a 2-D map. Horizontal = the main flow;
  vertical stacks = sub-slides. Drag to reorder; hover a thumbnail for its
  actions.
- **Canvas** (center) — the current slide, rendered with the deck's real theme.
  This is where you edit.
- **Toolbar** (top) — the formatting ribbon plus deck actions (PDF, ZIP,
  Offline, Present, Save).
- **Inspector** (right) — properties for whatever is selected, or for the slide
  itself when nothing is. Extra tabs (**Image**, **Table**, **Effects**) appear
  here when the selection has them.

Two clicks are worth remembering: **one click selects** an element, a **second
click edits** it.

## 3. Edit text

Click a heading or paragraph to select it, then click again (or press Enter) to
start typing. The ribbon turns into a text toolbar — bold, italic, links,
headings vs. paragraph, lists, alignment, and text/highlight color, all rendered
at true theme fidelity.

![Editing text with the formatting ribbon](images/text-formatting.png)

Pasting text strips Word/Docs formatting by default, so pasted content adopts
your theme instead of dragging in foreign fonts. Click empty space (or press
Escape) to finish.

## 4. Insert something

Everything you can add lives in the **Insert** menu (the **+** at the left of the
ribbon) — and the most common blocks also have their own ribbon buttons.

![The Insert menu](images/insert-menu.png)

The next three steps add a table, a chart and a shape.

## 5. Add a table

Insert → **Table** drops in a table you can edit in place. Click a cell to select
the table; click again to type. **Tab** and the arrow keys move between cells.

![Editing a table cell, with table options in the inspector](images/table-editing.png)

For full styling — selecting rows/columns and setting colors, alignment and
borders in bulk — see [Styling tables](#styling-tables) below. Paste from a
spreadsheet to fill a table instantly.

## 6. Add a chart

Insert → **Chart** opens the chart editor: pick a type, fill the data grid (or
paste CSV/TSV), and tweak titles, legend and number formatting — with a live
preview beside it.

![The chart editor](images/chart-modal.png)

When you click **Save chart** it's baked into the slide as a plain SVG, so your
deck stays standalone with no chart library. The data stays editable — reopen
the chart any time to change it. (You can also right-click a table and
**Convert to chart** to turn its numbers into one.)

## 7. Draw a shape or diagram

Open the **Shapes** gallery on the ribbon for rectangles, ellipses, arrows and a
full set of flowchart shapes.

![The shapes gallery](images/shapes-gallery.png)

Pick a shape and drag on the canvas to draw it — you'll see a live preview.
Lines and arrows are special: drag an endpoint and it **snaps to the nearest
box** and stays attached when you move things, so quick diagrams hold together.
Click a selected shape and type to give it a label.

## 8. Select and fine-tune

Select any element and the **inspector** fills with its properties — size,
colors, borders, and type-specific options. A small floating toolbar appears for
quick duplicate/delete.

![An element selected, inspector populated](images/element-selected.png)

Drag an element to position it freely; snap guides help you line things up, and
the arrow keys nudge (hold Shift for bigger steps). Everything you do writes
plain, valid reveal.js markup — never a proprietary format. Changed your mind?
**Return to flow** strips the positioning back to normal layout.

## 9. Make it move (optional)

Reveal's **fragments** reveal elements one step at a time. Select an element,
turn on a fragment in the inspector, pick an effect, and reorder them in the
fragment list — you can step through them right in the editor.

For slide-to-slide motion, toggle **auto-animate** on a slide and use the
sorter's *Duplicate for auto-animate step*: edit the copy and reveal morphs
between the two.

## 10. Present and export

- **Present** opens the actual file — exactly what your audience sees.
- **PDF** exports a print-ready PDF in one click.
- **ZIP** downloads the deck plus its local assets, ready to hand off.
- **Offline** vendors the CDN reveal.js into the deck folder so it presents with
  no network — pair it with ZIP for a fully self-contained bundle.

## 11. Save

Hit **Save** (Ctrl/Cmd+S). RevealEditor writes clean HTML back to the same file
— slides you didn't touch stay byte-for-byte identical, so your version history
only shows what actually changed.

That's the whole loop. The focused tutorials below go deeper on specific
features; the [user guide](USAGE.md) covers every area in reference form.

---

# Feature tutorials

## Masking & cropping images

Shape a photo into a circle (or any shape) and crop it to just the region you
want — all non-destructive, all plain CSS. The original file is never altered.

1. **Select an image.** An **Image** tab appears at the top of the inspector.
   Open it — or just **double-click the image** to jump straight into mask mode.
2. **Pick a shape** from the **Mask** grid: Circle, Ellipse, Rounded, Rectangle,
   Triangle, Diamond or Hexagon. The photo clips to it immediately, and drag
   handles appear on the canvas.

   ![Masking an image to a circle from the Image tab](images/image-mask.png)

3. **Fine-tune on the canvas.** Drag the handles to reshape the mask — a circle's
   radius, an ellipse's two radii, a rectangle's edges, a polygon's corners. Move
   the center handle to reposition it. Press **Done** (or Esc) when you're happy.
4. **Crop instead** by clicking **Crop image**. Drag the frame edges to set the
   crop rectangle and drag the photo to pan what shows through; **Done** applies
   it. The **Fit** control (Fill / Cover / Contain) sets how the image fills its
   box.

   ![Cropping an image with the on-canvas frame](images/image-crop.png)

5. **Corners and border** live in the same tab — round the corners or add a
   border in one click.

> Masks and crops are written as inline `clip-path` / `object-fit` — the deck
> stays standalone and the shadow of a masked image follows its shape.

## Adding shadows & effects

The **Effects** tab works on *any* element — image, shape, or text box — and its
effects stack.

1. **Select an element** and open the **Effects** tab.
2. **Shadow** — pick a preset (Soft → Long) and a color. The shadow follows the
   element's real shape, so a circle-masked photo casts a *circular* shadow and
   text shadows its glyphs.

   ![The Effects tab: shadow, opacity, blur and adjustments](images/effects.png)

3. **Opacity** and **Blur** — drag the sliders for a live preview on the canvas.
4. **Adjust** — toggle **Grayscale / Sepia / Invert**, or drag **Brightness** and
   **Saturation**. Combine them freely: a subtle shadow, grayscale, and a touch
   of blur all at once, as in the shot above.

> Effects are plain inline CSS (`filter`, `opacity`) and compose into a single
> value, so they render anywhere with no runtime and round-trip cleanly.

## Styling tables

Style a single cell, a whole row or column, or the entire table in one move.

1. **Click a cell.** A **Table** tab appears — open it.
2. **Choose a scope.** Use the strips along the table's top and left edges to
   select a whole **column** or **row** (the corner selects the whole table), or
   **shift-click / drag across cells** for a custom range. Selected cells
   highlight, and the **Scope** buttons mirror your choice.

   ![Selecting a column and the Table tab's styling controls](images/table-styling.png)

3. **Restyle in bulk.** In the Table tab set **Fill** and **Text** color, toggle
   **Bold / Italic**, set horizontal and vertical **alignment**, **font size**,
   and **borders** — every cell in your selection updates together.
4. **Change structure.** Switch a style preset (bordered / striped / minimal),
   toggle the **header row**, and add, delete, merge or split cells.

> Tip: paste a range from Excel or Google Sheets onto a slide to create a table
> from it instantly — or onto an existing cell to fill from there.
