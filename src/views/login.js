import { h } from '../dom.js';
import { ui } from '../data/ui.fr.js';
import { PRIVACY_VERSION } from '../data/privacy.fr.js';

const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);

function authErrorMessage(err) {
  const key = err?.code ?? err?.message ?? '';
  if (/invalid_credentials|invalid login/i.test(key)) return ui.login.badCredentials;
  if (/email_not_confirmed|not confirmed/i.test(key)) return ui.login.notConfirmed;
  return ui.login.generic;
}

export function renderLogin(root, { supabase, navigate }) {
  const t = ui.login;
  let mode = 'login';
  const card = h('section', { class: 'card' });
  root.append(h('header', { class: 'hero' },
    h('h1', {}, ui.appName),
    h('p', { class: 'muted' }, ui.questionnaireSubtitle),
    h('p', { class: 'muted hint' }, ui.questionnaireByline),
    h('p', { class: 'muted' }, ui.tagline)), card);
  draw();

  function draw(message = '') {
    const email = h('input', { type: 'email', required: true, autocomplete: 'email', inputmode: 'email' });
    const password = h('input', {
      type: 'password', required: true, minlength: 8,
      autocomplete: mode === 'login' ? 'current-password' : 'new-password'
    });
    const name = mode === 'signup'
      ? h('input', { type: 'text', required: true, maxlength: 40, autocomplete: 'given-name' })
      : null;
    // Consentement : case obligatoire à l'inscription uniquement (18 ans +
    // politique de confidentialité). Le texte n'est jamais envoyé : seule la
    // version du texte et la confirmation de majorité partent en base.
    const consent = mode === 'signup'
      ? h('input', { type: 'checkbox', required: true, name: 'consent' })
      : null;
    const msg = h('p', { class: 'msg', role: 'status' }, message);
    const submit = h('button', { class: 'btn', type: 'submit' }, mode === 'login' ? t.submitLogin : t.submitSignup);

    const form = h('form', {
      onsubmit: async (event) => {
        event.preventDefault();
        submit.disabled = true;
        msg.textContent = '';
        try {
          if (mode === 'login') {
            const { error } = await supabase.auth.signInWithPassword({
              email: email.value.trim(), password: password.value
            });
            if (error) throw error;
          } else {
            if (!consent.checked) {
              msg.textContent = t.consentRequired;
              submit.disabled = false;
              return;
            }
            const { data, error } = await supabase.auth.signUp({
              email: email.value.trim(),
              password: password.value,
              options: {
                data: {
                  display_name: name.value.trim(),
                  consent_version: PRIVACY_VERSION,
                  adult_confirmed: true
                },
                emailRedirectTo: window.location.origin
              }
            });
            if (error) throw error;
            if (!data.session) { mode = 'login'; draw(t.checkMail); return; }
          }
          // Connexion réussie : main.js re-rend l'écran via onAuthStateChange.
        } catch (err) {
          msg.textContent = authErrorMessage(err);
          submit.disabled = false;
        }
      }
    },
      name && field(t.name, name),
      field(t.email, email),
      field(t.password, password),
      consent && h('label', { class: 'check' }, consent, h('span', {}, t.consentText)),
      submit,
      msg
    );

    const toggle = h('button', {
      class: 'link', type: 'button',
      onclick: () => { mode = mode === 'login' ? 'signup' : 'login'; draw(); }
    }, mode === 'login' ? t.toSignup : t.toLogin);

    // Politique de confidentialité : accessible des deux côtés du formulaire,
    // y compris sans session.
    const privacyLink = h('p', { class: 'center' },
      h('button', {
        class: 'link', type: 'button',
        onclick: () => navigate?.({ name: 'privacy' })
      }, t.privacyLink));

    card.replaceChildren(h('h2', {}, mode === 'login' ? t.loginTitle : t.signupTitle), form, toggle, privacyLink);
  }
}
