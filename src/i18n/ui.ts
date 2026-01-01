export const languages = {
  hu: 'Magyar',
  en: 'English',
};

export const defaultLang = 'hu';

export const ui = {
  hu: {
    // Navigation
    'nav.home': 'Főoldal',
    'nav.about': 'Rólunk',
    'nav.treatments': 'Kezeléseink',
    'nav.faq': 'Gy. I. K.',
    'nav.prices': 'Árak',
    'nav.contact': 'Kapcsolat',
    'nav.consultation': 'Ingyenes konzultáció',
    'nav.booking': 'Időpontfoglalás',

    // Treatment names
    'treatment.laser': 'Dióda lézeres szőrtelenítés',
    'treatment.makeup': 'Sminktetoválás',
    'treatment.tattoo': 'Lézeres tetoválás eltávolítás',
    'treatment.pigment': 'Pigmentfolt eltávolítás',
    'treatment.carbon': 'Carbon Peeling',
    'treatment.hydra': 'HydraBeauty',

    // Locations
    'location.pest': 'Beautyflow Pest',
    'location.buda': 'Beautyflow Buda',

    // Common
    'common.readMore': 'Tovább',
    'common.bookNow': 'Foglalj időpontot',
    'common.freeConsultation': 'Ingyenes konzultáció',
    'common.learnMore': 'Tudj meg többet',
    'common.callUs': 'Hívj minket',
    'common.writeUs': 'Írj nekünk',

    // Footer
    'footer.openingHours': 'Nyitvatartás',
    'footer.address': 'Cím',
    'footer.phone': 'Telefon',
    'footer.email': 'E-mail',
    'footer.rights': 'Minden jog fenntartva.',

    // 404
    '404.title': '404 - Az oldal nem található',
    '404.description': 'A keresett oldal nem létezik vagy áthelyezésre került.',
    '404.backHome': 'Vissza a főoldalra',

    // Meta
    'meta.defaultDescription': 'A legcsajosabb szépségszalon a környékeden. Kiváló értékelések, csúcstechnológiájú gépek, nagyszerű hangulat és sokéves szakmai tapasztalat vár.',
    'meta.siteName': 'Beautyflow Szépségszalon és Lézeres Szőrtelenítés Budapest',
  },
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.about': 'About Us',
    'nav.treatments': 'Treatments',
    'nav.faq': 'FAQ',
    'nav.prices': 'Prices',
    'nav.contact': 'Contact',
    'nav.consultation': 'Free Consultation',
    'nav.booking': 'Book Appointment',

    // Treatment names
    'treatment.laser': 'Diode Laser Hair Removal',
    'treatment.makeup': 'Permanent Makeup',
    'treatment.tattoo': 'Laser Tattoo Removal',
    'treatment.pigment': 'Pigment Spot Removal',
    'treatment.carbon': 'Carbon Peeling',
    'treatment.hydra': 'HydraBeauty',

    // Locations
    'location.pest': 'Beautyflow Pest',
    'location.buda': 'Beautyflow Buda',

    // Common
    'common.readMore': 'Read More',
    'common.bookNow': 'Book Now',
    'common.freeConsultation': 'Free Consultation',
    'common.learnMore': 'Learn More',
    'common.callUs': 'Call Us',
    'common.writeUs': 'Write Us',

    // Footer
    'footer.openingHours': 'Opening Hours',
    'footer.address': 'Address',
    'footer.phone': 'Phone',
    'footer.email': 'Email',
    'footer.rights': 'All rights reserved.',

    // 404
    '404.title': '404 - Page Not Found',
    '404.description': 'The page you are looking for does not exist or has been moved.',
    '404.backHome': 'Back to Home',

    // Meta
    'meta.defaultDescription': 'The coolest beauty salon in your area. Excellent reviews, the most modern equipment, great atmosphere and years of professional experience await you.',
    'meta.siteName': 'Beautyflow Beauty Salon and Laser Hair Removal Budapest',
  },
} as const;

export type UIKey = keyof typeof ui.hu;
