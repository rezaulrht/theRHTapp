# Vault

Part of the [personal apps design](2026-11-13-overview-design.md). Lines marked
**(call)** are the designer's decisions.

The owner's teachers share books, lecture slides and other material through
Google Classroom. The owner also has an AI assistant teach the material part by
part and saves the useful explanations as PDF or markdown. They study from a PC
and a laptop and want all of it in one place, filed by subject, chapter and
topic, so they can see what was saved for any topic. Work material is a lighter
use of the same thing: important files and reminders.

The owner was explicit that nothing should be restricted: no fixed structure
and no fixed fields.

## Structure

- Folders inside folders, to any depth, named however the owner likes. Subject,
  Chapter and Topic are not built in; they are just folders the owner makes.
- Education and work are not separate features. They are top-level folders.
- A folder holds three kinds of item:

| Item | What it is |
|---|---|
| File | Anything uploaded: PDF, markdown, images, slides, documents |
| Note | Text written or pasted in the app, in markdown. An AI answer can be pasted straight in |
| Link | A web address with a title, such as the original AI conversation |

- Folders and items can be renamed, moved, and reordered. Several can be moved
  at once.

## Custom fields

- The owner defines fields with a name and a type: text, number, date, choice
  from a list, web address, or yes/no.
- Any field can be attached to any folder or item and given a value, for
  example "Teacher", "Exam date", "Source: ChatGPT".
- Field definitions are managed in settings. Lists can be filtered and sorted
  by field values.

## Tags

Tags cut across folders. An item can carry several, and a tag page lists
everything with that tag wherever it lives, so one AI answer can appear under
both "Chapter 3" and "Exam revision".

## Files

- Stored in Cloudflare R2. Everything else is in the shared database.
- Files upload directly from the browser to R2 using short-lived upload
  addresses issued by the back end, and download the same way. The bucket is
  private.
- Several files can be uploaded at once, including by drag and drop on a
  computer.
- Maximum file size is a setting, starting at 100 MB **(call)**.
- Settings shows storage used against the 10 GB free allowance.

Opening files:

- PDF, markdown, plain text and images open inside the app.
- PowerPoint and Word files download and do not open in the app **(call)**.
  Showing them in a browser needs a conversion service, which is outside the
  free setup. Slides shared as PDF open normally. The owner accepted "slides
  open inside the app" in conversation, so this narrows that and needs their
  agreement.
- Every other type downloads.

## Search

One search box covers folder and item names, note text, link titles and
addresses, tags, and custom field values. Search does not look inside PDF or
other uploaded file contents in the first version **(call)**.

## Reminders

Any folder or item can carry reminders, one-time or repeating, delivered
through the shared reminder engine on the owner's chosen channels. The
reminder opens the folder or item it belongs to.

## To-do lists

Each folder can have a simple to-do list: text, an optional due date, and a
done tick. A due date can have a reminder.

## Calendar

A month and list view showing every Vault reminder, to-do due date, and custom
date field value (such as exam dates) in one place.

## Finding things quickly

- Pinned: the owner pins folders or items; pins show on the Vault front page
  and the Today page.
- Recent: the last items opened or added.

## Trash

Deleting moves a folder or item to the trash, where it can be restored for 30
days. After that it is removed for good, including its file in R2. The owner
can empty the trash early. The number of days is a setting.

## Settings for this section

Custom fields, tags, maximum file size, trash period, storage used.

## Tests

Moving folders (including refusing to move a folder into itself), trash and
restore, permanent deletion removing the stored file, search across each
searchable kind, and custom field filtering.
