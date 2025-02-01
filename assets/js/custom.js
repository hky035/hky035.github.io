class TipElement extends HTMLElement {
    constructor() {
        super();
        this.addEventListener('mouseenter', this.showTooltip);
        this.addEventListener('mouseleave', this.hideTooltip);
    }

    connectedCallback() {
        const content = this.getAttribute('content');
        this.innerHTML = `
            <span class="tip">
                ${this.textContent}
                <div class="tooltip">${content}</div>
            </span>
        `;
        this.style.textDecoration = 'underline';
        this.style.textDecorationColor = 'rgba(79, 177, 186, 0.5)';
        this.style.textUnderlineOffset = '3px';
    }

    showTooltip() {
        this.style.cursor = 'pointer';
        const tooltip = this.querySelector('.tooltip');
        tooltip.style.visibility = 'visible';
        tooltip.style.opacity = '1';
    }

    hideTooltip() {
        this.style.fontWeight = '400';
        const tooltip = this.querySelector('.tooltip');
        tooltip.style.visibility = 'hidden';
        tooltip.style.opacity = '0';
    }
}

customElements.define('tip-tag', TipElement);