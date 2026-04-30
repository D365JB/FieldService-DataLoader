# Sample attachments

`reset.py` does not delete annotations directly — they are removed when their
parent work order is deleted.

Drop these into the loader by setting in `run-config.yaml`:

```yaml
attachments:
  attach_photo_to_open_wo: true
  attach_pdf_inspection_to_open_wo: true
```

Recommended files (not committed; add yourself):

- `sample-photo.jpg` — any field-relevant photo.
- `inspection-template.pdf` — the document used by the Copilot inspection-template demo.
