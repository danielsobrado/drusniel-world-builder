/**
 * Shared DOM factories for Drusniel HUD components.
 */

/**
 * Renders a restrained obsidian keycap badge for keyboard or controller prompts.
 * @param {string} label
 * @param {{ controller?: boolean, className?: string }} [options]
 * @returns {HTMLElement}
 */
export function createKeycapBadge(label, { controller = false, className = '' } = {}) {
  const badge = document.createElement('kbd');
  badge.className = `ds-keycap${controller ? ' ds-keycap--controller' : ''}${className ? ` ${className}` : ''}`;
  badge.textContent = String(label ?? '');
  return badge;
}

/**
 * Renders a 1px tapered antique-gold rule with a subtle center diamond node.
 * @param {{ className?: string }} [options]
 * @returns {HTMLDivElement}
 */
export function createOrnamentRule({ className = '' } = {}) {
  const rule = document.createElement('div');
  rule.className = `ds-ornament-rule${className ? ` ${className}` : ''}`;
  rule.setAttribute('aria-hidden', 'true');
  return rule;
}
