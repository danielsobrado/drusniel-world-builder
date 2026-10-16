/** Existing QA scenarios reveal the real inspector tab before acting on a control. */
export function shapeLocator(page, selector) {
  function wrap(locator) {
    return new Proxy(locator, { get(target, key) {
      const member = target[key];
      if (typeof member !== 'function') return member;
      if (['click', 'selectOption', 'fill', 'check', 'uncheck', 'press', 'focus'].includes(key)) return async (...args) => {
        if (await locator.count() === 1) {
          const scope = await locator.evaluate(element => element.dataset.shapeField === 'craft' ? 'all' : element.closest('[data-inspector-scope]')?.dataset.inspectorScope);
          if (scope) await page.locator(`[data-inspector-context="${scope}"]`).click();
        }
        return member.apply(target, args);
      };
      return (...args) => ['first', 'last', 'nth', 'filter', 'locator'].includes(key) ? wrap(member.apply(target, args)) : member.apply(target, args);
    } });
  }
  return wrap(page.locator(selector));
}
