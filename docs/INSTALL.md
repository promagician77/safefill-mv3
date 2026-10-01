# Installing SafeFill

## For professionals (Chrome Web Store)

The extension is published as an **unlisted** item: only people with the link
can find it.

1. Open the install link your team sends you, in Chrome.
2. Choose **Add to Chrome**. Chrome lists what the extension can do: read and
   change data on your company's site (to fetch your record), and act on the
   current tab only when you click it.
3. Pin it: puzzle-piece icon in the toolbar, then the pin next to SafeFill.

Using it: open the record in the web app, choose **Fill on portal**, then on
the portal tab click SafeFill and **Fill this page**. Fields that were filled
are outlined in green; fields it could not choose between are outlined in
dashed amber. Review every field, then submit the form yourself.

## For managed Chrome (IT installs it for everyone)

Google Admin console, or the Chrome policy on managed machines:

```json
{
  "ExtensionInstallForcelist": ["<EXTENSION_ID>;https://clients2.google.com/service/update2/crx"]
}
```

Updates then arrive automatically after each release passes Web Store review.

## For testers (unpacked build)

1. Download `safefill-<version>.zip` from the release artifacts and unzip it.
2. `chrome://extensions`, turn on **Developer mode**, **Load unpacked**, pick the folder.

An unpacked build does not update itself; use it only for testing.

## Removing it

`chrome://extensions`, SafeFill, **Remove**. There is nothing to clean up:
the extension never stored anything.
