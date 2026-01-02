// GTM DataLayer Push Helper
// Following analytics-measurement skill conventions

declare global {
  interface Window {
    dataLayer: Record<string, any>[];
  }
}

export function pushEvent(event: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined') {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event,
      ...params,
    });
  }
}

// Pre-defined events following naming convention: [action]_[object]
export const gtmEvents = {
  // Conversion events (mark as conversions in GA4)
  ctaClick: (location: string, text: string) =>
    pushEvent('cta_click', { cta_location: location, cta_text: text }),

  phoneClick: (location: string) =>
    pushEvent('phone_click', { click_location: location }),

  whatsappClick: (location: string) =>
    pushEvent('whatsapp_click', { click_location: location }),

  formStart: (formName: string) =>
    pushEvent('form_start', { form_name: formName }),

  formSubmit: (formName: string, formType?: string) =>
    pushEvent('form_submit', { form_name: formName, form_type: formType }),

  // Micro events (for optimization, not KPIs)
  videoPlay: (title: string) =>
    pushEvent('video_play', { video_title: title }),

  videoProgress: (title: string, percent: number) =>
    pushEvent('video_progress', { video_title: title, video_percent: percent }),
};
