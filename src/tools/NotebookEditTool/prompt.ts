export const DESCRIPTION =
  'Edit cells in a Jupyter notebook after reading the notebook.'
export const PROMPT = `Edit a Jupyter notebook (.ipynb file) cell.

Read notebook with Read tool first. Match exact cell IDs from Read output (e.g. \`cell-0\`).

Parameters:
- \`notebook_path\`: absolute path.
- \`cell_id\`: required for replace/delete. Target insertion point for insert.
- \`new_source\`: replacement string (empty for delete).
- \`cell_type\`: "code" or "markdown" (required for insert).
- \`edit_mode\`: "replace" (default), "insert", or "delete".`
