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
      this.onScroll = this.onScroll.bind(this);
      window.addEventListener('scroll', this.onScroll, { passive: true });
    }
    disconnectedCallback() { window.removeEventListener('scroll', this.onScroll); }
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
      }
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
     Scroll-reveal animations
     ----------------------------------------------------------------------- */
  function initScrollAnimations() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const triggers = document.querySelectorAll('.scroll-trigger');
    if (reduce || !triggers.length || !('IntersectionObserver' in window)) {
      triggers.forEach((el) => el.classList.add('aura-in'));
      return;
    }
    const observer = new IntersectionObserver(
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
    triggers.forEach((el) => observer.observe(el));
  }

  /* Blur-up: fade images in once decoded */
  function initImageFade() {
    document.querySelectorAll('img.image-fade').forEach((img) => {
      if (img.complete) img.classList.add('loaded');
      else img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
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
      const params = new URLSearchParams(new FormData(this.form)).toString();
      this.render(this.baseUrl + (params ? '?' + params : ''), true);
    }
    onClick(e) {
      const link = e.target.closest('a[href]');
      if (!link) return;
      if (link.matches('.active-facet, .pagination__item, .facets__clear-all') || link.hasAttribute('data-facet-link')) {
        e.preventDefault();
        this.render(link.href, true);
        this.closeDrawer();
      }
    }
    onPop() { this.render(location.href, false); }
    closeDrawer() {
      const d = document.getElementById('filter-drawer');
      if (d && d.classList.contains('active') && typeof d.close === 'function') d.close();
    }
    render(url, push) {
      const u = new URL(url, location.origin);
      u.searchParams.set('section_id', this.sectionId);
      this.classList.add('facets--loading');
      fetch(u.toString())
        .then((r) => r.text())
        .then((text) => {
          const doc = new DOMParser().parseFromString(text, 'text/html');
          ['#ProductGridContainer', '.active-facets-wrap', '[data-product-count]', '#FacetFiltersForm'].forEach((sel) => {
            const nw = doc.querySelector(sel);
            const cur = this.querySelector(sel);
            if (nw && cur) cur.innerHTML = nw.innerHTML;
          });
          if (push) {
            const clean = new URL(url, location.origin);
            clean.searchParams.delete('section_id');
            history.pushState({ aura: true }, '', clean.toString());
          }
          this.classList.remove('facets--loading');
          initWishlist();
          publish('facets:update', {});
        })
        .catch(() => this.classList.remove('facets--loading'));
    }
  }
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
})();
