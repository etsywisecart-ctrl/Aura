/* ==========================================================================
   Aura — global.js
   Vanilla JS custom elements powering interactivity across the theme.
   ========================================================================== */
(function () {
  'use strict';

  /* -----------------------------------------------------------------------
     Utilities
     ----------------------------------------------------------------------- */
  window.Aura = window.Aura || {};

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function fetchConfig(type = 'json') {
    return {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: `application/${type}`
      }
    };
  }

  const formatMoney = (cents) => {
    if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      return window.Shopify.formatMoney(cents);
    }
    return '$' + (cents / 100).toFixed(2);
  };

  /* Simple pub/sub for cross-component events */
  const subscribers = {};
  const PUB_SUB_EVENTS = { cartUpdate: 'cart-update', quantityUpdate: 'quantity-update' };

  function subscribe(eventName, cb) {
    subscribers[eventName] = subscribers[eventName] || [];
    subscribers[eventName].push(cb);
    return () => {
      subscribers[eventName] = subscribers[eventName].filter((x) => x !== cb);
    };
  }

  function publish(eventName, data) {
    (subscribers[eventName] || []).forEach((cb) => cb(data));
  }

  window.Aura.subscribe = subscribe;
  window.Aura.publish = publish;
  window.Aura.PUB_SUB_EVENTS = PUB_SUB_EVENTS;

  function trapFocus(container, elementToFocus) {
    const focusable = Array.from(
      container.querySelectorAll(
        'summary, a[href], button:not([disabled]), [tabindex]:not([tabindex^="-"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
      )
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    container.__trapHandler = function (e) {
      if (e.code !== 'Tab' && e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', container.__trapHandler);
    (elementToFocus || first).focus();
  }

  function removeTrapFocus(container) {
    if (container && container.__trapHandler) {
      document.removeEventListener('keydown', container.__trapHandler);
    }
  }

  /* -----------------------------------------------------------------------
     Drawer base (menu + cart + search) — openers use [data-drawer-open]
     ----------------------------------------------------------------------- */
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-drawer-open]');
    if (!opener) return;
    const drawer = document.getElementById(opener.getAttribute('data-drawer-open'));
    if (drawer && typeof drawer.open === 'function') {
      e.preventDefault();
      drawer.open(opener);
    }
  });

  class SideDrawer extends HTMLElement {
    constructor() {
      super();
      this.activeElement = null;
      this.onKeyUp = this.onKeyUp.bind(this);
    }

    connectedCallback() {
      this.querySelectorAll('[data-drawer-close]').forEach((el) =>
        el.addEventListener('click', () => this.close())
      );
      const overlay = this.querySelector('.drawer__overlay');
      if (overlay) overlay.addEventListener('click', () => this.close());
    }

    onKeyUp(e) {
      if (e.code === 'Escape' || e.key === 'Escape') this.close();
    }

    open(opener) {
      this.activeElement = opener || document.activeElement;
      this.classList.add('active');
      document.body.classList.add('overflow-hidden');
      document.addEventListener('keyup', this.onKeyUp);
      this.setAttribute('aria-hidden', 'false');
      const inner = this.querySelector('.drawer__inner');
      setTimeout(() => trapFocus(this, this.querySelector('[data-drawer-close]')), 200);
    }

    close() {
      this.classList.remove('active');
      document.body.classList.remove('overflow-hidden');
      document.removeEventListener('keyup', this.onKeyUp);
      removeTrapFocus(this);
      this.setAttribute('aria-hidden', 'true');
      if (this.activeElement && typeof this.activeElement.focus === 'function') {
        this.activeElement.focus();
      }
    }
  }
  customElements.define('side-drawer', SideDrawer);

  /* -----------------------------------------------------------------------
     Sticky header — hide on scroll down, reveal on scroll up
     ----------------------------------------------------------------------- */
  class StickyHeader extends HTMLElement {
    connectedCallback() {
      if (this.dataset.sticky !== 'true') return;
      this.lastScroll = 0;
      this.wasHidden = null;
      this.onScroll = this.onScroll.bind(this);
      this.onResize = debounce(this.publishOffset.bind(this), 150);
      window.addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('resize', this.onResize);
      this.publishOffset();
    }
    disconnectedCallback() {
      window.removeEventListener('scroll', this.onScroll);
      window.removeEventListener('resize', this.onResize);
    }
    /* Anything else that sticks (the collection toolbar) pins below the header
       while it is on screen, and to the top once it has slid away. */
    publishOffset() {
      const hidden = this.classList.contains('header--hidden');
      document.documentElement.style.setProperty('--sticky-offset', hidden ? '0px' : this.offsetHeight + 'px');
      this.wasHidden = hidden;
    }
    onScroll() {
      const y = window.scrollY;
      this.classList.toggle('header--scrolled', y > 60);
      if (this.dataset.stickyType === 'on-scroll-up') {
        const menuOpen = document.body.classList.contains('overflow-hidden');
        if (!menuOpen && y > this.lastScroll && y > 320) {
          this.classList.add('header--hidden');
        } else {
          this.classList.remove('header--hidden');
        }
      }
      if (this.classList.contains('header--hidden') !== this.wasHidden) this.publishOffset();
      this.lastScroll = y;
    }
  }
  customElements.define('sticky-header', StickyHeader);

  /* -----------------------------------------------------------------------
     Quantity input
     ----------------------------------------------------------------------- */
  class QuantityInput extends HTMLElement {
    connectedCallback() {
      this.input = this.querySelector('input');
      this.changeEvent = new Event('change', { bubbles: true });
      this.querySelectorAll('button').forEach((btn) =>
        btn.addEventListener('click', this.onButtonClick.bind(this))
      );
    }

    onButtonClick(e) {
      e.preventDefault();
      const previousValue = this.input.value;
      const step = e.target.closest('button').name === 'plus' ? 1 : -1;
      const min = parseInt(this.input.min || 0, 10);
      const max = this.input.max ? parseInt(this.input.max, 10) : Infinity;
      let value = (parseInt(this.input.value, 10) || 0) + step;
      value = Math.max(min, Math.min(max, value));
      this.input.value = value;
      if (previousValue !== String(value)) this.input.dispatchEvent(this.changeEvent);
    }
  }
  customElements.define('quantity-input', QuantityInput);

  /* -----------------------------------------------------------------------
     Variant picker
     ----------------------------------------------------------------------- */
  class VariantSelects extends HTMLElement {
    connectedCallback() {
      this.addEventListener('change', this.onVariantChange.bind(this));
    }

    onVariantChange() {
      this.updateSelectedOptions();
      this.updateVariant();
      if (!this.currentVariant) {
        this.setUnavailable();
      } else {
        this.updateURL();
        this.updateFormId();
        this.updatePrice();
        this.updateAvailability();
        this.updateInventory();
      }
    }

    updateInventory() {
      const el = document.getElementById(`Inventory-${this.dataset.section}`);
      if (!el) return;
      const v = this.currentVariant;
      const threshold = parseInt(el.dataset.threshold, 10) || 10;
      let html = '';
      if (v && v.available) {
        if (v.inventory_management && typeof v.inventory_quantity === 'number' && v.inventory_quantity > 0 && v.inventory_quantity <= threshold) {
          html = `<span class="inv inv--low"><span class="inv__dot"></span>${(el.dataset.low || 'Low stock: [q] left').replace('[q]', v.inventory_quantity)}</span>`;
        } else {
          html = `<span class="inv inv--in"><span class="inv__dot"></span>${el.dataset.in || 'In stock'}</span>`;
        }
      }
      el.innerHTML = html;
    }

    updateSelectedOptions() {
      this.options = Array.from(this.querySelectorAll('select, fieldset')).map((el) => {
        if (el.tagName === 'SELECT') return el.value;
        const checked = el.querySelector('input:checked');
        return checked ? checked.value : null;
      });
    }

    getVariantData() {
      if (!this.variantData) {
        const script = this.querySelector('[type="application/json"]');
        this.variantData = script ? JSON.parse(script.textContent) : [];
      }
      return this.variantData;
    }

    updateVariant() {
      this.currentVariant = this.getVariantData().find((variant) =>
        variant.options.every((opt, i) => this.options[i] === opt)
      );
    }

    updateURL() {
      if (!this.currentVariant || this.dataset.updateUrl === 'false') return;
      window.history.replaceState({}, '', `${this.dataset.url}?variant=${this.currentVariant.id}`);
    }

    updateFormId() {
      const idInput = document.querySelector(`#product-form-${this.dataset.section} input[name="id"]`);
      if (idInput) {
        idInput.value = this.currentVariant.id;
        idInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    updatePrice() {
      const priceEl = document.getElementById(`price-${this.dataset.section}`);
      if (!priceEl) return;
      const v = this.currentVariant;
      let html = `<span class="price-item price-item--regular">${formatMoney(v.price)}</span>`;
      if (v.compare_at_price > v.price) {
        html =
          `<span class="price-item price-item--sale">${formatMoney(v.price)}</span>` +
          `<s class="price-item price-item--regular">${formatMoney(v.compare_at_price)}</s>`;
        priceEl.classList.add('price--on-sale');
      } else {
        priceEl.classList.remove('price--on-sale');
      }
      priceEl.querySelector('.price__container').innerHTML = html;
    }

    updateAvailability() {
      const btn = document.querySelector(`#product-form-${this.dataset.section} [name="add"]`);
      if (!btn) return;
      const text = btn.querySelector('span');
      if (this.currentVariant.available) {
        btn.removeAttribute('disabled');
        if (text) text.textContent = btn.dataset.addLabel || 'Add to cart';
      } else {
        btn.setAttribute('disabled', 'disabled');
        if (text) text.textContent = btn.dataset.soldOutLabel || 'Sold out';
      }
    }

    setUnavailable() {
      const btn = document.querySelector(`#product-form-${this.dataset.section} [name="add"]`);
      if (btn) {
        btn.setAttribute('disabled', 'disabled');
        const text = btn.querySelector('span');
        if (text) text.textContent = btn.dataset.unavailableLabel || 'Unavailable';
      }
    }
  }
  customElements.define('variant-selects', VariantSelects);

  /* -----------------------------------------------------------------------
     Product form — AJAX add to cart
     ----------------------------------------------------------------------- */
  class ProductForm extends HTMLElement {
    connectedCallback() {
      this.form = this.querySelector('form');
      if (!this.form) return;
      this.form.addEventListener('submit', this.onSubmit.bind(this));
      this.submitButton = this.querySelector('[type="submit"]');
      this.cart = document.querySelector('cart-drawer') || document.querySelector('cart-items');
    }

    onSubmit(e) {
      if (!this.cart || (window.routes && window.location.pathname === window.routes.cart_url)) {
        return; // fall back to normal navigation when there's no drawer
      }
      e.preventDefault();
      if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

      this.setLoading(true);
      const formData = new FormData(this.form);
      if (this.cart) {
        formData.append('sections', this.cart.getSectionsToRender().map((s) => s.id));
        formData.append('sections_url', window.location.pathname);
      }

      const config = fetchConfig('javascript');
      delete config.headers['Content-Type'];
      config.body = formData;

      fetch(`${window.routes.cart_add_url}`, config)
        .then((r) => r.json())
        .then((response) => {
          if (response.status) {
            this.showError(response.description || response.message);
            return;
          }
          if (this.cart && typeof this.cart.renderContents === 'function') {
            this.cart.renderContents(response);
          }
          publish(PUB_SUB_EVENTS.cartUpdate, { source: 'product-form' });
          if (this.cart && typeof this.cart.open === 'function') this.cart.open();
        })
        .catch((err) => console.error(err))
        .finally(() => this.setLoading(false));
    }

    setLoading(loading) {
      if (!this.submitButton) return;
      this.submitButton.setAttribute('aria-disabled', loading);
      this.submitButton.classList.toggle('loading', loading);
      const spinner = this.querySelector('.loading-spinner');
      if (spinner) spinner.classList.toggle('hidden', !loading);
    }

    showError(message) {
      const errorEl = this.querySelector('.product-form__error-message-wrapper');
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
      } else {
        console.warn(message);
      }
    }
  }
  customElements.define('product-form', ProductForm);

  /* -----------------------------------------------------------------------
     Cart items (line item quantity + remove) — shared by page + drawer
     ----------------------------------------------------------------------- */
  class CartItems extends HTMLElement {
    connectedCallback() {
      this.addEventListener('change', debounce(this.onChange.bind(this), 300));
      this.addEventListener('click', (e) => {
        const remove = e.target.closest('[data-remove]');
        if (remove) {
          e.preventDefault();
          this.updateQuantity(remove.dataset.index, 0);
        }
      });
    }

    getSectionsToRender() {
      return [
        { id: 'main-cart-items', section: 'main-cart-items', selector: '.js-contents' },
        { id: 'cart-icon-bubble', section: 'cart-icon-bubble', selector: '.shopify-section' },
        { id: 'cart-live-region-text', section: 'cart-live-region-text', selector: '.shopify-section' },
        { id: 'main-cart-footer', section: 'main-cart-footer', selector: '.js-contents' }
      ];
    }

    onChange(event) {
      const input = event.target.closest('.quantity__input');
      if (!input) return;
      this.updateQuantity(input.dataset.index, input.value);
    }

    updateQuantity(line, quantity) {
      this.enableLoading(line);
      const body = JSON.stringify({
        line,
        quantity,
        sections: this.getSectionsToRender().map((s) => s.section),
        sections_url: window.location.pathname
      });

      fetch(`${window.routes.cart_change_url}`, { ...fetchConfig(), body })
        .then((r) => r.json())
        .then((state) => {
          this.renderContents(state);
          publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items' });
        })
        .catch(() => {})
        .finally(() => this.disableLoading());
    }

    renderContents(state) {
      if (!state.sections) return;
      this.getSectionsToRender().forEach((section) => {
        const el = document.getElementById(section.id);
        if (!el || !state.sections[section.section]) return;
        const target = el.querySelector(section.selector) || el;
        const parsed = new DOMParser().parseFromString(state.sections[section.section], 'text/html');
        const source = parsed.querySelector(section.selector);
        if (source) target.innerHTML = source.innerHTML;
      });
      if (state.item_count === 0) {
        this.closest('cart-drawer')?.classList.add('is-empty');
      }
    }

    enableLoading(line) {
      this.classList.add('cart--loading');
      const row = this.querySelector(`[data-index="${line}"]`);
      row?.querySelector('.loading-overlay')?.classList.remove('hidden');
    }

    disableLoading() {
      this.classList.remove('cart--loading');
      this.querySelectorAll('.loading-overlay').forEach((o) => o.classList.add('hidden'));
    }
  }
  customElements.define('cart-items', CartItems);

  /* Line-item editing inside the drawer refreshes the drawer itself */
  class CartDrawerItems extends CartItems {
    getSectionsToRender() {
      return [
        { id: 'cart-drawer', section: 'cart-drawer', selector: '.drawer__inner' },
        { id: 'cart-icon-bubble', section: 'cart-icon-bubble', selector: '.shopify-section' }
      ];
    }
  }
  customElements.define('cart-drawer-items', CartDrawerItems);

  /* -----------------------------------------------------------------------
     Cart drawer — extends drawer behavior + renders sections
     ----------------------------------------------------------------------- */
  class CartDrawer extends SideDrawer {
    connectedCallback() {
      super.connectedCallback();
      this.cartItems = this.querySelector('cart-items');
    }

    getSectionsToRender() {
      return [
        { id: 'cart-drawer', section: 'cart-drawer', selector: '.drawer__inner' },
        { id: 'cart-icon-bubble', section: 'cart-icon-bubble', selector: '.shopify-section' }
      ];
    }

    renderContents(response) {
      this.classList.remove('is-empty');
      if (!response.sections) return;
      this.getSectionsToRender().forEach((section) => {
        const el = document.getElementById(section.id);
        if (!el || !response.sections[section.section]) return;
        const parsed = new DOMParser().parseFromString(response.sections[section.section], 'text/html');
        const source = parsed.querySelector(section.selector);
        const target = el.querySelector(section.selector) || el;
        if (source) target.innerHTML = source.innerHTML;
      });
    }
  }
  customElements.define('cart-drawer', CartDrawer);

  /* -----------------------------------------------------------------------
     Quick view — compact product modal loaded via Section Rendering
     ----------------------------------------------------------------------- */
  class QuickView extends SideDrawer {
    connectedCallback() {
      super.connectedCallback();
      this.body = this.querySelector('[data-quickview-body]');
      subscribe(PUB_SUB_EVENTS.cartUpdate, () => { if (this.classList.contains('active')) this.close(); });
    }
    load(url, opener) {
      if (!this.body) return;
      this.open(opener);
      this.body.innerHTML = '<div class="quickview__loading"><div class="spinner"></div></div>';
      const u = url + (url.indexOf('?') > -1 ? '&' : '?') + 'section_id=quickview-product';
      fetch(u)
        .then((r) => r.text())
        .then((text) => {
          const grid = new DOMParser().parseFromString(text, 'text/html').querySelector('.quickview__grid');
          this.body.innerHTML = grid ? grid.outerHTML : '';
        })
        .catch(() => { this.body.innerHTML = ''; });
    }
  }
  customElements.define('quick-view', QuickView);

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quick-view-url]');
    if (!btn) return;
    e.preventDefault();
    const qv = document.getElementById('quick-view');
    if (qv && typeof qv.load === 'function') qv.load(btn.getAttribute('data-quick-view-url'), btn);
  });

  /* Cart cross-sell — complementary products loaded into the drawer */
  class CartRecommendations extends HTMLElement {
    connectedCallback() {
      const id = this.dataset.productId;
      if (!id) { this.hidden = true; return; }
      const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
      const url = `${root}recommendations/products?product_id=${id}&intent=${this.dataset.intent || 'complementary'}&limit=${this.dataset.limit || 3}&section_id=cart-recommendations`;
      fetch(url)
        .then((r) => r.text())
        .then((text) => {
          const inner = new DOMParser().parseFromString(text, 'text/html').querySelector('.cart-rec__inner');
          if (inner && inner.children.length) { this.innerHTML = inner.outerHTML; this.hidden = false; }
          else { this.hidden = true; }
        })
        .catch(() => { this.hidden = true; });
    }
  }
  customElements.define('cart-recommendations', CartRecommendations);

  /* Keep the header cart bubble in sync after AJAX updates */
  subscribe(PUB_SUB_EVENTS.cartUpdate, () => {
    fetch(`${window.routes.cart_url}?sections=cart-icon-bubble`)
      .then((r) => r.json())
      .then((data) => {
        const html = data['cart-icon-bubble'];
        if (!html) return;
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const source = parsed.querySelector('.shopify-section');
        const target = document.getElementById('cart-icon-bubble');
        if (source && target) target.innerHTML = source.innerHTML;
      })
      .catch(() => {});
  });

  /* -----------------------------------------------------------------------
     Predictive search (lightweight)
     ----------------------------------------------------------------------- */
  class PredictiveSearch extends HTMLElement {
    connectedCallback() {
      this.input = this.querySelector('input[type="search"]');
      this.results = this.querySelector('[data-predictive-results]');
      if (!this.input || !this.results) return;
      this.input.addEventListener('input', debounce(this.onInput.bind(this), 300));
    }

    onInput() {
      const term = this.input.value.trim();
      if (term.length < 2) {
        this.results.innerHTML = '';
        this.results.hidden = true;
        return;
      }
      const url = `${window.routes.predictive_search_url}?q=${encodeURIComponent(
        term
      )}&resources[type]=product&section_id=predictive-search`;
      fetch(url)
        .then((r) => r.text())
        .then((text) => {
          const parsed = new DOMParser().parseFromString(text, 'text/html');
          const inner = parsed.querySelector('#shopify-section-predictive-search');
          this.results.innerHTML = inner ? inner.innerHTML : '';
          this.results.hidden = false;
        })
        .catch(() => {});
    }
  }
  customElements.define('predictive-search', PredictiveSearch);

  /* -----------------------------------------------------------------------
     Slideshow / media gallery thumbnails
     ----------------------------------------------------------------------- */
  class MediaGallery extends HTMLElement {
    connectedCallback() {
      this.thumbs = this.querySelectorAll('[data-media-thumb]');
      this.viewer = this.querySelector('[data-media-viewer]');
      this.thumbs.forEach((thumb) =>
        thumb.addEventListener('click', () => this.setActive(thumb.dataset.mediaThumb))
      );
    }

    setActive(id) {
      const target = this.querySelector(`[data-media-id="${id}"]`);
      if (target && this.viewer) {
        this.viewer.prepend(target);
        this.viewer.scrollTo({ top: 0, behavior: 'smooth' });
      }
      this.thumbs.forEach((t) => t.classList.toggle('is-active', t.dataset.mediaThumb === id));
    }
  }
  customElements.define('media-gallery', MediaGallery);

  /* -----------------------------------------------------------------------
     Slideshow
     ----------------------------------------------------------------------- */
  class SlideshowComponent extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-slides]');
      this.slides = Array.from(this.querySelectorAll('[data-slide]'));
      this.dots = Array.from(this.querySelectorAll('[data-slide-to]'));
      this.index = 0;
      if (this.slides.length < 2) return;
      const prev = this.querySelector('[data-slide-prev]');
      const next = this.querySelector('[data-slide-next]');
      if (prev) prev.addEventListener('click', () => this.go(this.index - 1));
      if (next) next.addEventListener('click', () => this.go(this.index + 1));
      this.dots.forEach((d, i) => d.addEventListener('click', () => this.go(i)));
      this.setupSwipe();
      this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (this.dataset.autoplay === 'true' && !this.reduce) {
        this.startAuto();
        this.addEventListener('mouseenter', () => this.stopAuto());
        this.addEventListener('mouseleave', () => this.startAuto());
      }
      this.update();
    }
    go(i) { this.index = (i + this.slides.length) % this.slides.length; this.update(); this.startAuto(); }
    update() {
      if (this.track) this.track.style.transform = 'translateX(' + (-this.index * 100) + '%)';
      this.dots.forEach((d, i) => d.classList.toggle('is-active', i === this.index));
      this.slides.forEach((s, i) => s.setAttribute('aria-hidden', i === this.index ? 'false' : 'true'));
    }
    startAuto() {
      if (this.dataset.autoplay !== 'true' || this.reduce) return;
      this.stopAuto();
      const s = (parseInt(this.dataset.speed, 10) || 6) * 1000;
      this.timer = setInterval(() => this.go(this.index + 1), s);
    }
    stopAuto() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
    setupSwipe() {
      let x0 = null;
      this.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      this.addEventListener('touchend', (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) this.go(this.index + (dx < 0 ? 1 : -1));
        x0 = null;
      });
    }
  }
  customElements.define('slideshow-component', SlideshowComponent);

  /* -----------------------------------------------------------------------
     Scroll-reveal animations

     Elements with .scroll-trigger start at opacity:0 and reveal (via .aura-in)
     when they enter the viewport. A single shared observer is reused across
     re-inits so dynamically-rendered content (Shopify editor, Section
     Rendering API) gets wired without leaking observers. In the theme editor
     (Shopify.designMode) or under reduced-motion, everything is revealed
     immediately — the merchant must always see their content while editing.
     ----------------------------------------------------------------------- */
  const inDesignMode = () => !!(window.Shopify && window.Shopify.designMode);
  let revealObserver = null;

  function revealNow(root) {
    (root || document).querySelectorAll('.scroll-trigger:not(.aura-in)').forEach((el) => el.classList.add('aura-in'));
  }

  function initScrollAnimations(scope) {
    const root = scope || document;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const triggers = root.querySelectorAll('.scroll-trigger:not(.aura-in)');
    if (!triggers.length) return;
    if (reduce || inDesignMode() || !('IntersectionObserver' in window)) {
      triggers.forEach((el) => el.classList.add('aura-in'));
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('aura-in');
              obs.unobserve(entry.target);
            }
          });
        },
        { rootMargin: '0px 0px -8% 0px' }
      );
    }
    triggers.forEach((el) => revealObserver.observe(el));
  }

  /* Blur-up: fade images in once loaded. Handles cached images (already
     complete), broken images (reveal on error so the container is never
     stuck invisible), and re-scans on demand for dynamic content. */
  function initImageFade(scope) {
    (scope || document).querySelectorAll('img.image-fade:not(.loaded)').forEach((img) => {
      if (img.complete) { img.classList.add('loaded'); return; }
      const reveal = () => img.classList.add('loaded');
      img.addEventListener('load', reveal, { once: true });
      img.addEventListener('error', reveal, { once: true });
    });
  }

  /* -----------------------------------------------------------------------
     Facet filters — instant filtering/sorting via the Section Rendering API.
     Uses collection.filters (Shopify Search & Discovery). Degrades to a
     normal GET form submit without JS.
     ----------------------------------------------------------------------- */
  class FacetFilters extends HTMLElement {
    connectedCallback() {
      this.sectionId = this.dataset.section;
      this.baseUrl = this.dataset.url;
      this.debouncedApply = debounce(this.applyFromForm.bind(this), 500);
      this.addEventListener('change', this.onChange.bind(this));
      this.addEventListener('click', this.onClick.bind(this));
      this.onPop = this.onPop.bind(this);
      window.addEventListener('popstate', this.onPop);
    }
    disconnectedCallback() { window.removeEventListener('popstate', this.onPop); }
    get form() { return this.querySelector('#FacetFiltersForm'); }

    onChange(e) {
      if (!this.form) return;
      if (e.target.matches('input[type="number"]')) this.debouncedApply();
      else this.applyFromForm();
    }
    applyFromForm() {
      /* Skip blank fields so an untouched price box never lands in the URL. */
      const params = new URLSearchParams();
      for (const [key, value] of new FormData(this.form).entries()) {
        if (value !== '') params.append(key, value);
      }
      const query = params.toString();
      this.render(this.baseUrl + (query ? '?' + query : ''), true);
    }
    onClick(e) {
      const link = e.target.closest('a[href]');
      if (!link) return;
      if (link.matches('.active-facet, .pagination__item, .facets__clear-all, .quicknav__chip') || link.hasAttribute('data-facet-link')) {
        e.preventDefault();
        this.render(link.href, true, link.matches('.pagination__item'));
        this.closeDrawer();
      }
    }
    onPop() { this.render(location.href, false); }
    closeDrawer() {
      const d = document.getElementById('filter-drawer');
      if (d && d.classList.contains('active') && typeof d.close === 'function') d.close();
    }
    /* Paging swaps the grid under the reader, so put them back at its top. */
    scrollToGrid() {
      const anchor = this.querySelector('#ProductGridContainer');
      if (!anchor) return;
      const offset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sticky-offset'), 10) || 0;
      const top = anchor.getBoundingClientRect().top + window.scrollY - offset - 80;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
    render(url, push, scrollTop) {
      const u = new URL(url, location.origin);
      u.searchParams.set('section_id', this.sectionId);
      this.classList.add('facets--loading');
      /* Controls are re-rendered, so remember where the keyboard was and
         which filter groups the shopper had expanded. */
      const activeId = document.activeElement && document.activeElement.id;
      const openGroups = [];
      this.querySelectorAll('details[data-filter][open]').forEach((d) => openGroups.push(d.dataset.filter));
      fetch(u.toString())
        .then((r) => r.text())
        .then((text) => {
          const doc = new DOMParser().parseFromString(text, 'text/html');
          FacetFilters.SWAP.forEach((sel) => {
            const incoming = doc.querySelectorAll(sel);
            this.querySelectorAll(sel).forEach((cur, i) => {
              if (incoming[i]) cur.innerHTML = incoming[i].innerHTML;
            });
          });
          if (push) {
            const clean = new URL(url, location.origin);
            clean.searchParams.delete('section_id');
            history.pushState({ aura: true }, '', clean.toString());
          }
          this.classList.remove('facets--loading');
          this.querySelectorAll('details[data-filter]').forEach((d) => {
            d.open = openGroups.indexOf(d.dataset.filter) !== -1;
          });
          if (activeId) {
            const restored = this.querySelector('#' + (window.CSS && CSS.escape ? CSS.escape(activeId) : activeId));
            if (restored) restored.focus({ preventScroll: true });
          }
          if (scrollTop) this.scrollToGrid();
          initWishlist();
          publish('facets:update', {});
        })
        .catch(() => this.classList.remove('facets--loading'));
    }
  }
  /* Regions re-rendered from the Section Rendering API response. Only the
     contents are replaced — the elements themselves persist, which is what
     lets the aria-live product count actually announce a new result count. */
  FacetFilters.SWAP = [
    '#ProductGridContainer',
    '.active-facets-wrap',
    '[data-product-count]',
    '[data-filter-count]',
    '.collection-toolbar__sort',
    '.quicknav',
    '#FacetFiltersForm',
  ];
  customElements.define('facet-filters', FacetFilters);

  /* Wishlist — client-side, persisted in localStorage */
  const WISHLIST_KEY = 'aura-wishlist';
  function getWishlist() {
    try { return JSON.parse(localStorage.getItem(WISHLIST_KEY)) || []; } catch (e) { return []; }
  }
  function setWishlist(list) {
    try { localStorage.setItem(WISHLIST_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function initWishlist() {
    const list = getWishlist();
    document.querySelectorAll('[data-wishlist]').forEach((btn) => {
      const active = list.indexOf(btn.getAttribute('data-product-id')) > -1;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wishlist]');
    if (!btn) return;
    e.preventDefault();
    const id = btn.getAttribute('data-product-id');
    const list = getWishlist();
    const i = list.indexOf(id);
    const active = i === -1;
    if (active) list.push(id); else list.splice(i, 1);
    setWishlist(list);
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    publish('wishlist:change', { id: id, active: active });
  });

  /* Horizontal scroller arrows — [data-scroll="prev|next"] targets [data-scroller] */
  document.addEventListener('click', (e) => {
    const arrow = e.target.closest('[data-scroll]');
    if (!arrow) return;
    const wrap = arrow.closest('[data-scroller-wrap]');
    const scroller = wrap && wrap.querySelector('[data-scroller]');
    if (!scroller) return;
    const amount = Math.round(scroller.clientWidth * 0.8);
    scroller.scrollBy({ left: arrow.getAttribute('data-scroll') === 'next' ? amount : -amount, behavior: 'smooth' });
  });

  function init() {
    initScrollAnimations();
    initImageFade();
    initWishlist();
  }

  if (document.readyState !== 'loading') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

  /* Safety net: once everything has loaded, force-reveal any trigger that is
     already in the viewport but somehow wasn't caught by the observer (e.g.
     refreshed while scrolled down, or a race on injection). Content must
     never be left permanently invisible. */
  window.addEventListener('load', () => {
    initImageFade();
    requestAnimationFrame(() => {
      document.querySelectorAll('.scroll-trigger:not(.aura-in)').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('aura-in');
      });
    });
  });

  /* Re-wire content rendered after initial load — Shopify theme editor and the
     Section Rendering API both inject/replace sections the one-shot init never
     saw. Without this, their .scroll-trigger / .image-fade elements stay at
     opacity:0 forever (the "images disappear in the editor / after reload" bug). */
  document.addEventListener('shopify:section:load', (e) => {
    initScrollAnimations(e.target);
    initImageFade(e.target);
    initWishlist();
  });
  document.addEventListener('shopify:section:select', (e) => revealNow(e.target));
  document.addEventListener('shopify:block:select', (e) => {
    revealNow((e.target && e.target.closest && e.target.closest('.shopify-section')) || document);
  });
})();
