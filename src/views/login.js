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
    const submit = h('button', { class: 'btn', type: 'submit' },
      mode === 'login' ? t.submitLogin
        : mode === 'signup' ? t.submitSignup
          : t.forgotSubmit);

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
          } else if (mode === 'forgot') {
            const { error } = await supabase.auth.resetPasswordForEmail(
              email.value.trim(), { redirectTo: window.location.origin }
            );
            if (error) throw error;
            mode = 'login';
            draw(t.forgotSent);
            return;
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
          // À l'inscription, jamais le détail technique : message sobre unique.
          msg.textContent = mode === 'signup' ? t.signupError : authErrorMessage(err);
          submit.disabled = false;
        }
      }
    },
      name && field(t.name, name),
      field(t.email, email),
      mode !== 'forgot' && field(t.password, password),
      consent && h('label', { class: 'check' }, consent, h('span', {}, t.consentText)),
      submit,
      msg
    );

    const toggle = h('button', {
      class: 'link', type: 'button',
      onclick: () => { mode = mode === 'login' ? 'signup' : 'login'; draw(); }
    }, mode === 'login' ? t.toSignup : t.toLogin);

    // Mot de passe oublié : visible depuis la connexion, bascule vers le
    // formulaire email qui envoie le lien de réinitialisation.
    const forgot = mode === 'login'
      ? h('p', { class: 'center' },
          h('button', {
            class: 'link', type: 'button',
            onclick: () => { mode = 'forgot'; draw(); }
          }, t.forgotPassword))
      : null;
    const forgotBack = mode === 'forgot'
      ? h('p', { class: 'center' },
          h('button', {
            class: 'link', type: 'button',
            onclick: () => { mode = 'login'; draw(); }
          }, t.toLogin))
      : null;

    // Politique de confidentialité : accessible des deux côtés du formulaire,
    // y compris sans session.
    const privacyLink = h('p', { class: 'center' },
      h('button', {
        class: 'link', type: 'button',
        onclick: () => navigate?.({ name: 'privacy' })
      }, t.privacyLink));

    const title = mode === 'login' ? t.loginTitle
      : mode === 'signup' ? t.signupTitle
        : t.forgotTitle;
    const intro = mode === 'forgot'
      ? h('p', { class: 'muted' }, t.forgotIntro)
      : null;
    // En connexion : bascule vers l'inscription + mot de passe oublié.
    // En inscription : bascule vers la connexion. En oublié : retour connexion.
    const links = [];
    if (mode === 'login') links.push(toggle, forgot);
    else if (mode === 'signup') links.push(toggle);
    else links.push(forgotBack);
    card.replaceChildren(h('h2', {}, title), intro, form, ...links, privacyLink);
  }
}

// Écran « Nouveau mot de passe » après le clic sur le lien reçu par email
// (événement PASSWORD_RECOVERY). Deux champs, 10 caractères minimum,
// updateUser({ password }) — jamais dans le callback d'authentification.
export function renderRecovery(root, { supabase, navigate }) {
  const t = ui.login;
  const card = h('section', { class: 'card' });
  root.append(h('header', { class: 'hero' },
    h('h1', {}, ui.appName),
    h('p', { class: 'muted' }, ui.questionnaireSubtitle)), card);

  const pass = h('input', {
    type: 'password', required: true, minlength: 10,
    autocomplete: 'new-password'
  });
  const pass2 = h('input', {
    type: 'password', required: true, minlength: 10,
    autocomplete: 'new-password'
  });
  const msg = h('p', { class: 'msg', role: 'status' });
  const submit = h('button', { class: 'btn', type: 'submit' }, t.recoverySubmit);

  const form = h('form', {
    onsubmit: async (event) => {
      event.preventDefault();
      submit.disabled = true;
      msg.textContent = '';
      if (pass.value.length < 10) {
        msg.textContent = t.recoveryShort;
        submit.disabled = false;
        return;
      }
      if (pass.value !== pass2.value) {
        msg.textContent = t.recoveryMismatch;
        submit.disabled = false;
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: pass.value });
      if (error) {
        msg.textContent = t.recoveryError;
        submit.disabled = false;
        return;
      }
      msg.textContent = t.recoveryDone;
      // Session rétablie : retour à l'accueil (main.js re-rend).
      navigate({ name: 'home', notice: t.recoveryDone });
    }
  },
    field(t.newPassword, pass),
    field(t.confirmNewPassword, pass2),
    submit,
    msg);

  card.replaceChildren(
    h('h2', {}, t.recoveryTitle),
    h('p', { class: 'muted' }, t.recoveryIntro),
    form);
}
