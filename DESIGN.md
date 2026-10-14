---
name: Six Hats
description: Live Six Thinking Hats sessions run as a secret ballot, counted open together.
colors:
  ballot-violet: "#5b2c83"
  ballot-violet-deep: "#4a2270"
  violet-wash: "#eee8f5"
  violet-rule: "#b9a2d4"
  on-violet: "#ffffff"
  print-ink: "#17161c"
  ballot-paper: "#f1f2f5"
  sheet: "#fbfbfd"
  hover-grey: "#e7e8ec"
  rule: "#d7d8dd"
  rule-strong: "#b7b8c1"
  disabled-rule: "#8a8b95"
  mute: "#63646e"
  live-green: "#1e6b45"
  warn-amber: "#8a5300"
  danger: "#a3262c"
  danger-wash: "#f8e9e9"
  hat-white: "#f7f7f5"
  hat-red: "#b3261e"
  hat-black: "#17161c"
  hat-yellow: "#f2c230"
  hat-green: "#1e6b3a"
  hat-blue: "#1f5fbf"
typography:
  clock:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "6rem"
    fontWeight: 720
    lineHeight: 0.9
    letterSpacing: "-0.02em"
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 78"
  prompt:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 640
    lineHeight: 1.15
    letterSpacing: "-0.012em"
    fontVariation: "'wdth' 96"
  hat-name:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 820
    lineHeight: 1.05
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 108"
  headline:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 750
    lineHeight: 1.15
    letterSpacing: "-0.012em"
    fontVariation: "'wdth' 104"
  title:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 720
    lineHeight: 1.25
  body:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum'"
  body-sm:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  button:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 620
  label:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 650
    letterSpacing: "0.1em"
    fontVariation: "'wdth' 82"
  tally-numeral:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 720
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 82"
rounded:
  none: "0px"
  dot: "50%"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "64px"
components:
  button:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.print-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "40px"
  button-hover:
    backgroundColor: "{colors.hover-grey}"
    textColor: "{colors.print-ink}"
  button-primary:
    backgroundColor: "{colors.ballot-violet}"
    textColor: "{colors.on-violet}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.ballot-violet-deep}"
    textColor: "{colors.on-violet}"
  button-danger:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.danger}"
    rounded: "{rounded.none}"
  button-danger-hover:
    backgroundColor: "{colors.danger-wash}"
    textColor: "{colors.danger}"
  button-sm:
    typography: "{typography.body-sm}"
    padding: "0 12px"
    height: "32px"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.print-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "9px 12px"
  chip:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.print-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "4px 10px"
  slip:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.print-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
  slip-voted:
    backgroundColor: "{colors.violet-wash}"
    textColor: "{colors.print-ink}"
  flow-cell-now:
    backgroundColor: "{colors.violet-wash}"
    textColor: "{colors.print-ink}"
    padding: "12px 16px"
  appbar:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.print-ink}"
    height: "56px"
---

# Design System: Six Hats

## Overview

**Creative North Star: "The Count"**

Every hat runs as a secret ballot. People mark in private, their slips stay sealed, and the room counts them open together when the clock reaches zero. The interface is ballot paper and print ink: a cool, slightly blue-grey paper ground with near-white sheets laid on it, black type and black hairlines for structure, and a single indelible violet that means *yours, live, cast*. Nothing is soft or rounded. Every count is drawn as a tally (four strokes and a violet fifth struck across) with a tabular numeral beside it.

Density is operational: a board that stays readable when screen-shared to a room, with one dominant object per state (the ballot frame while writing, the vote sheet while voting, the decision sheet at the end) and a quiet register of people at the side. Hat colour is a material, not a theme. It appears only where a hat is named, so the rest of the page stays paper and ink whichever hat is open.

The dark theme is the counting room at night: an ink ground, paper-coloured type, and a lifted violet. It is a full re-mapping of the same nine-step neutral ramp, not an inversion filter.

**Key Characteristics:**
- Cool ballot-paper ground with near-white sheets; black print ink for type and structural lines.
- One accent, violet, reserved for what is yours, live or cast.
- Archivo Variable throughout, using its width axis: condensed for numerals and labels, extended for the wordmark and hat names.
- Every numeral is tabular; every count is a tally.
- Square corners, 1px hairlines, no shadows on surfaces.
- States read as printed marks: hairline at rest, filled when chosen, dashed when disabled, violet ring on focus.

## Colors

Paper, ink and one violet, with six hat colours held in reserve for the hats themselves.

### Primary
- **Ballot Violet** (`ballot-violet`): the one accent. Used for the primary button (Seal point, Reveal now, Join, Close voting and count), the focus ring, link underlines, the caret, the current flow-strip cell's 3px foot rule, the countdown's time rule, the strike across each fifth tally mark, the vote ink-mark cross, the live status dot, the session code display and rank 1 in results. In dark theme it lifts to a pale lavender (#c4a8ec) and the text on it turns ink.
- **Deep Violet** (`ballot-violet-deep`): hover and pressed state of the primary button only.
- **Violet Wash** (`violet-wash`): fill for things that are chosen or current: the open flow-strip cell, a slip you voted for, the selected writing-mode card, text selection.
- **Violet Rule** (`violet-rule`): the solid border of a sealed slip; violet enough to read as "sealed", quieter than a full violet frame.

### Neutral
One nine-step tonal ramp (n0 to n9) supplies every neutral; nothing is tinted ad hoc.
- **Print Ink** (`print-ink`, n9): all type, structural 1px lines (app bar foot, ballot frame, composer, panel heads and foots), tally strokes, the black hat.
- **Ballot Paper** (`ballot-paper`, n1): the page ground, and the ground of panel footers and read-only fields so they sit "under" the sheet.
- **Sheet** (`sheet`, n0): every card, slip, frame, input and the app bar.
- **Hover Grey** (`hover-grey`, n2): hover fill for buttons and quiet controls; loading skeletons.
- **Rule** (`rule`, n3): hairlines between rows, slips and list items; the empty countdown track.
- **Rule Strong** (`rule-strong`, n4): resting input and chip borders.
- **Disabled Rule** (`disabled-rule`, n5): the dashed border of a disabled button; the outline of an offline presence dot.
- **Mute** (`mute`, n6): secondary text, labels, captions, credits.

### Status
- **Live Green** (`live-green`): online presence dot only.
- **Warn Amber** (`warn-amber`): the character counter within 50 of the 500 limit.
- **Danger** (`danger`) and **Danger Wash** (`danger-wash`): delete buttons, error text, the inline delete-confirm strip, error toasts.

### Hat colours
White, Red, Black, Yellow, Green and Blue (`hat-*`), each paired with a fixed ink (`--hat-*-ink`: ink on White and Yellow, white on the rest). White hat carries an ink border so it separates from the sheet; Black hat carries a mid-grey border in dark theme.

### Named Rules
**The One Ink Rule.** Violet means yours, live or cast. If an element is none of those, it is not violet.

**The Hat Containment Rule.** Hat colours appear only on hat badges, the open hat's panel inside the ballot frame, and flow swatches. A hat is always shown with its name and icon, never by colour alone.

**The Ballot Paper Rule.** The ground is cool paper and the sheets are near-white. Never warm the ramp toward cream.

## Typography

**Display Font:** Archivo Variable (self-hosted via @fontsource-variable/archivo, weight 100–900, width 62–125%), falling back to Archivo, system-ui, sans-serif.
**Body Font:** the same family.

**Character:** one grotesque used at many widths. Condensed cuts carry numbers and labels like a printed form; extended cuts give the wordmark and hat names a stamped weight.

### Hierarchy
The working ramp is a near-1.2 scale: 12, 14, 16, 19, 23, 28, 34px, plus the clock at 96px.
- **Clock** (720, 96px, line-height 0.9, condensed): the countdown only. Drops to 64px below 720px. Goes mute and is struck through in violet once the hat is revealed.
- **Prompt** (640, 34px, 1.15, max 26ch): the open hat's question inside the ballot frame; 23px on phones.
- **Hat name** (820, 28px, extended): the hat's name in its coloured panel.
- **Headline** (750, 28px, 1.15, balanced wrap): page and session titles; 23px on phones.
- **Title** (720, 19px, 1.25): section heads (Your points, Revealed, Register, Earlier hats).
- **Body** (400, 16px, 1.5): slip text, form input. The composer textarea is set at 19px.
- **Body small** (14px): captions, credits, hints, flow-strip cells.
- **Button** (620, 15px).
- **Label** (650, 12px, 0.1em tracking, uppercase, condensed 82%): form field labels, legends, table column heads, chips (Host, Scribe, Code) and the Sealed stamp.
- **Tally numeral** (720, 19px, condensed): the count beside every tally.

### Named Rules
**The Tabular Count Rule.** Tabular numerals are set on the root; every numeral in the product (clock, code, counts, timers, dates) aligns in columns.

**The Form Caps Rule.** Condensed tracked capitals label a field, a column, a chip or a stamp. They never sit above a heading as a decorative tag.

## Layout

An 8px grid with a 4px half-step (spacing s1–s8: 4 to 64px). Pages sit in a 1280px column with 32px gutters (16px below 720px); single-purpose forms (passcode, join) narrow to 480px.

The live board is a main column plus a 320px register sidebar with a 32px gap, sticky at the top; below 1000px the register drops beneath the main column. Above the grid run the session bar (title and focus question left; status, code chip and invite actions right, aligned to the baseline) and the flow strip (a full-width row of numbered step cells, then Vote and Decision), which scrolls horizontally on narrow screens and keeps the current cell centred.

The ballot frame is a three-column grid: hat panel (232px), prompt (fluid), clock (min 232px), with the facilitator toolbar spanning its foot. At 1100px the clock wraps under the prompt; at 720px everything stacks and the hat panel becomes a single row. Slips pack into an auto-fill grid of min 280px columns (two-up in the main column at desktop) with 8px gaps.

**The Sheet on Paper Rule.** Content lives on sheets laid on the paper ground. Panel footers and toolbars step back down to paper so the sheet reads as the writing surface.

## Elevation & Depth

Flat. Depth is carried by tone (sheet on paper) and by line weight: black 1px ink lines frame the primary objects (app bar foot, ballot frame, composer, panel head and foot dividers); grey 1px rules divide rows and slips. The only shadow in the system is on toasts, which float over the page.

### Shadow Vocabulary
- **Toast lift** (`box-shadow: 0 8px 24px rgb(0 0 0 / 0.18)`): ink toasts at the foot of the viewport. Nothing else casts a shadow.

### Named Rules
**The Two Lines Rule.** Ink lines mark the structure of the thing you are using; grey rules separate items within it. Never thicken a line to create emphasis. Use ink instead.

## Shapes

Square corners everywhere (radius 0 on buttons, inputs, chips, slips, frames and toasts). The only round forms are the 8–9px presence and status dots. Rotation is a deliberate print device and stays rare: the Sealed stamp sits at -2°, and the tally's fifth stroke and the wordmark's strike run at -28°. Selects use a drawn CSS chevron, not a rounded native control.

**The Square Corner Rule.** If it holds content or takes input, it has square corners. Only a presence or status dot is round.

## Components

### Buttons
Printed and plain: a hairline box that fills when it matters.
- **Shape:** square, 40px tall (32px small), 16px side padding, 1px ink border, 18px Lucide icon with 8px gap.
- **Default:** sheet fill, ink text and border; hover fills hover-grey; active fills n3.
- **Primary:** violet fill and border, white text (ink text in dark theme); hover goes deep violet.
- **Quiet:** borderless and transparent until hover.
- **Danger:** danger-coloured border and text; hover fills danger-wash.
- **Icon:** 32px square, quiet.
- **Disabled:** transparent fill, mute text, dashed disabled-rule border. Dashed means disabled and nothing else.
- **Focus:** 2px violet outline offset 2px (global).

### Chips
- **Style:** label type in a square 1px box (rule-strong border) on sheet. Ink-bordered variant for the session code; violet-bordered, violet-text variant for the Scribe tag.

### Hat badges
- **Style:** hat-coloured fill with its ink, Lucide hat icon (White: clipboard-list, Red: heart, Black: triangle-alert, Yellow: sun, Green: sprout, Blue: compass; stroke 1.75) and the hat's name. Three sizes (12, 14, 16px type). Never a swatch without a name.

### Inputs / Fields
- **Style:** sheet fill, 1px rule-strong border, square, 9px × 12px padding, 16px text; label above in Label type with 6px gap.
- **Hover:** border darkens to n6.
- **Focus:** border and a 1px ring both violet (composer textarea: inset 2px violet).
- **Read-only:** paper fill, mute text.
- **Checks and radios:** 18px, native, accent-colour violet.

### Navigation
- **App bar:** 56px sheet strip with an ink foot line. Wordmark left (an SVG tally of four ink strokes struck by one violet bar, then "Six Hats" at 19px, weight 820, extended 112%); text nav right at 14px/600 in mute, ink on hover, and the active route marked by an inset 2px violet underline. Below 350px the wordmark text hides and the tally mark stands alone.
- **Flow strip:** numbered cells (condensed number, hat swatch, short hat name, duration). Done cells strike their number through in violet; the current cell takes violet wash, bold name and a 3px violet foot rule; upcoming cells stay mute.

### Ballot frame (signature)
The open hat as a ballot: a sheet in a 1px ink frame. Left, the hat's coloured panel with 28px icon, hat name, focus and "Hat n of N · duration". Centre, the prompt and one line of instruction. Right, the countdown: condensed 96px numerals right-aligned over a 4px track whose violet fill shrinks with the time left. In the last ten seconds the numerals turn violet; when paused they go mute; at reveal they are struck through in violet and the caption reads "Revealed". The facilitator toolbar sits on a paper strip across the foot, divided by an ink line.

### Slips (signature)
Each point is a slip: a square sheet with a 1px rule border, body text, and a foot holding credit or seal, tally, and actions.
- **Sealed:** border turns violet-rule and the foot carries a Sealed stamp: a 1.5px violet box with a lock icon and condensed caps, rotated -2°. No author is shown.
- **Seal break:** at reveal the stamp clips away left-to-right while fading and shifting 6px (280ms), and the author credit fades in after a 120ms delay (220ms). Other people's slips enter with a cascade: each clips open from the top and rises 6px (220–280ms), staggered 40ms per slip and capped at the fifteenth.
- **Voted:** violet border and violet-wash fill; the Vote button becomes "Voted" with a violet ink mark.
- **Delete confirm:** replaces the foot with a danger-bordered, danger-wash strip ("Delete this point?" on a sealed slip, "Delete for everyone?" on an open one) with Keep and Delete.

### Tally (signature)
Counts drawn as marks: groups of four 2px × 16px ink strokes, a violet bar struck across at -28° to complete each group of five, 5px between groups; the tabular numeral sits beside it. Marks stop at 20; beyond that only the numeral grows. A zero shows just the mute numeral. Used in the register, earlier-hat rows, vote results and the ranked list.

### Ink mark
The vote mark: a 16px square drawn in a 1.5px stroke; when cast, a violet hand-drawn cross strokes in over 240ms. The voting panel shows remaining votes as a row of these boxes.

### Register
A sheet with an ink-ruled head ("Register", "n of N here"), 48px rows divided by grey rules: presence dot (live green when online, hollow grey when away), name with "(you)", Host and Scribe chips, and (for the host while writing) a sealed-count tally. A paper footer notes that only counts are visible.

### Toasts
Ink bars with paper text at the bottom centre, max 440px wide, entering with an 8px rise over 200ms; errors turn danger red.

## Do's and Don'ts

### Do:
- **Do** draw every count as a tally with its tabular numeral, and every cast vote as a violet ink mark.
- **Do** keep violet for what is yours, live or cast: primary action, focus, current step, the clock rule, the count strike, the vote.
- **Do** use ink 1px lines for the structure of the active object and grey rules between its items.
- **Do** show disabled controls with a dashed border and mute text, chosen ones filled, and focus with the violet ring.
- **Do** label fields, columns, chips and stamps in condensed tracked caps at 12px.
- **Do** pair every hat colour with the hat's name and its Lucide icon.
- **Do** map dark theme through the same nine-step ramp: ink ground (#121117), sheets one step up (#1c1b22), paper-coloured type (#f2f1f5), lifted violet.
- **Do** let reduced motion show the counted end state instantly; the global reduced-motion rule already collapses every transition.

### Don't:
- **Don't** build the sticky-note retro board: coloured cards in columns, avatar stacks, soft-shadowed rounded tiles.
- **Don't** use hat colours for cards, columns, page backgrounds or anything that is not a hat badge, the open hat's panel or a swatch.
- **Don't** round a corner. Only presence and status dots are circles.
- **Don't** add shadows to surfaces; toasts are the only floating layer.
- **Don't** use dashed borders for anything but disabled controls (a sealed slip is a solid violet-rule border plus its stamp).
- **Don't** put condensed caps above a headline as a decorative tag.
- **Don't** introduce a second accent or a warm cream ground.
