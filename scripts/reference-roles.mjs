// Adapted from sellerpilot-product-image-industrial/scripts/lib/source-reference-policy.mjs.
// Copyright (c) 2026 ninemouth. MIT; see LICENSE.
// Roles are supplied by Codex visual inspection, never guessed from filenames.
export function evidenceTagsForRole(role) {
  const map = {
    primary_identity: ["silhouette", "proportions", "primary_color", "material", "front_structure"],
    front: ["silhouette", "proportions", "front_structure"],
    side: ["depth", "side_profile", "strap_or_handle"],
    back: ["back_structure", "rear_hardware"],
    top: ["opening", "closure", "top_structure"],
    bottom: ["base_shape", "feet", "bottom_structure"],
    interior: ["interior", "lining", "compartments", "opening"],
    detail: ["hardware", "closure", "texture", "stitching", "micro_detail"],
    packaging: ["packaging", "included_items", "visible_markings"],
    logo: ["logo_or_markings", "micro_text"],
    scene: ["scale", "use_context"],
    surface_material: ["canonical_motif", "palette", "texture", "pattern_scale"],
  };
  return map[role] || [];
}
