# Linux Web API fallback for Tier 1 config rows.
# Each *.yaml here follows the same shape as data/*.yaml:
#
#   entity_set: territories
#   alt_key_field: name
#   rows:
#     - name: DEMO-TER-SEATTLE
#       description: "Seattle"
#
# The orchestrator loads files in lexical order when --use-webapi-config is set.
# This is **not** a full replacement for `pac data import` — see ../README.md.
