export const DESCRIPTION =
  'Edit cells in a Jupyter notebook after reading the notebook.'
export const PROMPT = `Edit a Jupyter notebook (.ipynb) cell.

Before using, read target notebook with Read tool in this session. Use cell IDs exactly as shown in Read output, e.g. <cell id="cell-0"> = cell_id "cell-0" not "0".

Parameters:
- notebook_path must be absolute path.
- cell_id required for edit_mode=replace or edit_mode=delete. For edit_mode=insert, omit cell_id to insert at beginning, or provide existing cell_id to insert after that cell.
- new_source required. For edit_mode=delete, pass empty string.
- cell_type must be "code" or "markdown" when edit_mode=insert.
- edit_mode defaults to replace; use edit_mode=insert to add cell, edit_mode=delete to remove cell.`
