export class CommandSearch {
  constructor(root, commands) {
    this.commands = commands;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'workspace-command-search';
    this.dialog.setAttribute('aria-label', 'Search editor commands');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.innerHTML = `
      <input type="search" placeholder="Search commands…" aria-label="Search commands" autocomplete="off">
      <div class="workspace-command-results" role="listbox" aria-label="Matching commands"></div>
      <p class="workspace-search-footer"><kbd>↑</kbd> <kbd>↓</kbd> Navigate <kbd>Enter</kbd> Run <kbd>Esc</kbd> Close</p>`;
    root.append(this.dialog);
    this.input = this.dialog.querySelector('input');
    this.results = this.dialog.querySelector('[role="listbox"]');
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-controls', 'workspace-command-results');
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.setAttribute('aria-expanded', 'true');
    this.results.id = 'workspace-command-results';
    this.input.addEventListener('input', () => this.render());
    this.dialog.addEventListener('keydown', (event) => this.handleKey(event));
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) this.close();
      const item = event.target.closest('[data-command-result]');
      if (item) this.run(Number(item.dataset.commandResult));
    });
  }

  open() {
    if (this.dialog.open) return;
    this.input.value = '';
    this.render();
    this.dialog.showModal();
    this.input.focus();
  }

  close() {
    if (!this.dialog.open) return false;
    this.dialog.close();
    return true;
  }

  render() {
    const terms = this.input.value.toLowerCase().trim().split(/\s+/);
    this.matches = this.commands.list().filter(({ id, label, shortcut, enabled }) => (
      id !== 'view.command-search' && label && enabled()
      && terms.every((term) => `${label} ${id} ${shortcut}`.toLowerCase().includes(term))
    ));
    const fragment = document.createDocumentFragment();
    for (const [index, command] of this.matches.entries()) {
      const item = document.createElement('div');
      item.setAttribute('role', 'option');
      item.id = `workspace-command-${index}`;
      item.dataset.commandResult = index;
      item.textContent = command.label;
      if (command.shortcut) {
        const key = document.createElement('kbd');
        key.textContent = command.shortcut;
        item.append(key);
      }
      fragment.append(item);
    }
    if (!this.matches.length) {
      const empty = document.createElement('p');
      empty.className = 'workspace-empty';
      empty.textContent = 'No available commands match.';
      fragment.append(empty);
      this.input.removeAttribute('aria-activedescendant');
    }
    this.results.replaceChildren(fragment);
    this.setActive(0);
  }

  setActive(index) {
    this.active = Math.max(0, Math.min(index, this.matches.length - 1));
    for (const item of this.results.querySelectorAll('[role="option"]')) {
      item.setAttribute('aria-selected', Number(item.dataset.commandResult) === this.active);
    }
    const item = this.results.children[this.active];
    if (this.matches.length) {
      this.input.setAttribute('aria-activedescendant', item.id);
      item.scrollIntoView({ block: 'nearest' });
    }
  }

  handleKey(event) {
    if (event.key === 'ArrowDown') this.setActive(this.active + 1);
    else if (event.key === 'ArrowUp') this.setActive(this.active - 1);
    else if (event.key === 'Enter') this.run(this.active);
    else if (event.key === 'Escape') this.close();
    else return;
    event.preventDefault();
    event.stopPropagation();
  }

  run(index) {
    const command = this.matches[index];
    if (!command) return;
    this.close();
    this.commands.execute(command.id);
  }
}
