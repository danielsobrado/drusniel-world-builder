import './towns.css';

/** "[E] Open door" hint shown while a door is within reach of the walker. */
export class TownInteractionPrompt {
  constructor(parent = document.body) {
    this.element = document.createElement('div');
    this.element.className = 'town-prompt';
    this.element.hidden = true;
    this.key = document.createElement('kbd');
    this.key.textContent = 'E';
    this.label = document.createElement('span');
    this.element.append(this.key, this.label);
    parent.append(this.element);
    this.text = '';
  }

  show(text) {
    if (text === this.text) return;
    this.text = text;
    this.element.hidden = !text;
    this.label.textContent = text;
  }

  dispose() {
    this.element.remove();
  }
}
