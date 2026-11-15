A floating list of actions opened from a button.

**You provide:** the trigger button with `aria-haspopup="menu"` and `aria-expanded`, a `<ul class="menu" role="menu">` of `menu__item` buttons, arrow-key navigation, and closing on Escape or outside click.

**Anatomy:** `surface-200`, 1px `border-subtle`, `radius-lg`, `shadow-md`, inner padding `space-1`. Items 36px tall, `radius-md`, icon in `ink-muted`, shortcut right-aligned in `caption`. Hover and focus fill `surface-300`. Separator is a `border-subtle` hairline.

**Do**
- Group related actions; put destructive ones last, after a separator, in `danger` with an icon.
- Keep labels verb first ("Rename", "Delete project").

**Don't**
- Put more than about eight items in one menu.
- Hide the only way to do a common task inside a menu.
