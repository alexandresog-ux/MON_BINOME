import { h } from '../dom.js';
import { ui } from '../data/ui.fr.js';

const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);

function authErrorMessage(err) {
  const key = err?.code ?? err?.message ?? '';
  if (/invalid_credentials|invalid login/i.test(key)) return ui.login.badCredentials;
  if (/email_not_confirmed|not confirmed/i.test(key)) return ui.login.notConfirmed;
  return ui.login.generic;
}

export function renderLogin(root, { supabase }) {
  const t = ui.login;
  let mode = 'login';
  const card = h('section', { class: 'card' });
  root.append(h('header', { class: 'hero' }, h('h1', {}, ui.appName), h('p', { class: 'muted' }, ui.tagline)), card);
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
            const { data, error } = await supabase.auth.signUp({
              email: email.value.trim(),
              password: password.value,
              options: { data: { display_name: name.value.trim() }, emailRedirectTo: window.location.origin }
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
      submit,
      msg
    );

    const toggle = h('button', {
      class: 'link', type: 'button',
      onclick: () => { mode = mode === 'login' ? 'signup' : 'login'; draw(); }
    }, mode === 'login' ? t.toSignup : t.toLogin);

    card.replaceChildren(h('h2', {}, mode === 'login' ? t.loginTitle : t.signupTitle), form, toggle);
  }
}
