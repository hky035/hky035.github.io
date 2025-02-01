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
        this.style.fontWeight = 'bold';
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

customElements.define('custom-tip', TipElement);

/* inline code block */
class CustomCode extends HTMLElement {
    connectedCallback() {
        // const shadow = this.attachShadow({ mode: 'open' });
        const span = document.createElement('span');
        this.classList.add('inline-code');
        span.innerHTML = this.innerHTML;
        // shadow.appendChild(span);
    }
}

// 커스텀 태그 정의
customElements.define('inline-code', CustomCode);
