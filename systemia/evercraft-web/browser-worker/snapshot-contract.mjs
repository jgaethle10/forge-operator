export const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6';
export const MAX_HEADINGS = 100;

export function browserSnapshotContract() {
  return {
    schema: 'evercraft.web.browser.snapshot.v2',
    heading_selector: HEADING_SELECTOR,
    max_headings: MAX_HEADINGS,
    preserves_semantic_heading_depth: true,
  };
}
