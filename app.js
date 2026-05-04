const SUPABASE_URL = "https://cxnyrxagqjjzoudsyjyi.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4bnlyeGFncWpqem91ZHN5anlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDU5MDMsImV4cCI6MjA5MzQyMTkwM30.3oTqDFRFSX76jWqPxum8bWFtCkdw3FC9SH1Xp6QSNS4";
const RESEND_KEY = "re_fmtJvozo_G9jyVwTXbiajYFyxHCb6V8sW";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 2. REFERENCIAS AL DOM ──
const form = document.getElementById("registroForm");
const inpUser = document.getElementById("username");
const inpEmail = document.getElementById("email");
const inpPass = document.getElementById("password");
const togglePass = document.getElementById("togglePass");
const btnSubmit = document.getElementById("btnSubmit");
const btnText = document.getElementById("btnText");
const btnLoader = document.getElementById("btnLoader");
const msgGlobal = document.getElementById("mensajeGlobal");

// ── 3. MOSTRAR / OCULTAR CONTRASEÑA ──
togglePass.addEventListener("click", () => {
    const esPassword = inpPass.type === "password";
    inpPass.type = esPassword ? "text" : "password";
    togglePass.textContent = esPassword ? "🙈" : "👁";
});

// ── 4. MEDIDOR DE FUERZA DE CONTRASEÑA ──
inpPass.addEventListener("input", () => {
    const val = inpPass.value;
    const fuerza = calcularFuerza(val);
    actualizarBarras(fuerza);
});

function calcularFuerza(pass) {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score; // 0-4
}

function actualizarBarras(score) {
    const bars = ["bar1", "bar2", "bar3", "bar4"];
    const clases = ["", "weak", "fair", "good", "strong"];
    const niveles = [
        [],
        ["weak"],
        ["weak", "fair"],
        ["weak", "fair", "good"],
        ["weak", "fair", "good", "strong"]
    ];

    bars.forEach((id, i) => {
        const bar = document.getElementById(id);
        bar.className = "bar";
        if (niveles[score][i]) bar.classList.add(niveles[score][i]);
    });
}

// ── 5. VALIDACIÓN EN TIEMPO REAL ──
inpUser.addEventListener("blur", () => validarCampo("username"));
inpEmail.addEventListener("blur", () => validarCampo("email"));
inpPass.addEventListener("blur", () => validarCampo("password"));

function validarCampo(campo) {
    const errores = {
        username: document.getElementById("err-username"),
        email: document.getElementById("err-email"),
        password: document.getElementById("err-password"),
    };

    errores[campo].textContent = "";

    if (campo === "username") {
        if (!inpUser.value.trim()) {
            errores.username.textContent = "El nombre de usuario es obligatorio.";
            return false;
        }
        if (inpUser.value.trim().length < 3) {
            errores.username.textContent = "Mínimo 3 caracteres.";
            return false;
        }
    }

    if (campo === "email") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!inpEmail.value.trim()) {
            errores.email.textContent = "El correo es obligatorio.";
            return false;
        }
        if (!emailRegex.test(inpEmail.value.trim())) {
            errores.email.textContent = "Ingresa un correo válido.";
            return false;
        }
    }

    if (campo === "password") {
        if (!inpPass.value) {
            errores.password.textContent = "La contraseña es obligatoria.";
            return false;
        }
        if (inpPass.value.length < 8) {
            errores.password.textContent = "Mínimo 8 caracteres.";
            return false;
        }
    }

    return true;
}

function validarTodo() {
    const u = validarCampo("username");
    const e = validarCampo("email");
    const p = validarCampo("password");
    return u && e && p;
}


form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!validarTodo()) return;

    // Mostrar loader
    btnText.style.display = "none";
    btnLoader.style.display = "inline-block";
    btnSubmit.disabled = true;
    msgGlobal.style.display = "none";
    msgGlobal.className = "mensaje-global";

    const username = inpUser.value.trim();
    const email = inpEmail.value.trim();
    const password = inpPass.value;

    try {
        // a) Registrar usuario en Supabase Auth
        const { data: authData, error: authError } = await db.auth.signUp({
            email,
            password,
            options: {
                data: { username }  // metadata adicional
            }
        });

        if (authError) throw authError;

        // b) Guardar datos extra en tabla "usuarios" (si la creaste)
        // Si no tienes la tabla, puedes comentar este bloque
        const userId = authData.user?.id;
        if (userId) {
            const { error: dbError } = await db
                .from("usuarios")
                .insert([{ id: userId, username, email }]);

            if (dbError) console.warn("No se pudo guardar en tabla usuarios:", dbError.message);
        }

        // Éxito — enviar correo de bienvenida
        await enviarCorreoBienvenida(email, username);
        mostrarMensaje("¡Cuenta creada! Te enviamos un correo de bienvenida. ✓", "exito");
        form.reset();
        actualizarBarras(0);

    } catch (err) {
        console.error("Error Supabase:", err.message, err);
        let msg = "Ocurrió un error. Inténtalo de nuevo.";
        if (err.message.includes("already registered") || err.message.includes("already been registered")) {
            msg = "Este correo ya está registrado.";
        } else if (err.message.includes("rate limit") || err.message.includes("429") || err.status === 429) {
            msg = "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
        } else if (err.message.includes("Password")) {
            msg = "La contraseña no cumple los requisitos de seguridad.";
        } else if (err.message.includes("Invalid")) {
            msg = "Credenciales inválidas.";
        } else if (err.message.includes("Email")) {
            msg = "Correo electrónico inválido o no permitido.";
        }
        mostrarMensaje(msg, "error-global");

    } finally {
        btnText.style.display = "inline";
        btnLoader.style.display = "none";
        btnSubmit.disabled = false;
    }
});

async function enviarCorreoBienvenida(emailDestino, username) {
    try {
        await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${RESEND_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "onboarding@resend.dev",
                to: emailDestino,
                subject: "¡Bienvenido/a!",
                html: `
                    <div style="font-family: sans-serif; max-width: 480px; margin: auto; padding: 32px;">
                        <p style="font-size: 18px;">La buena manito, gracias por crear la cuenta, te queremos</p>
                        <br>
                        <p style="font-size: 16px;">att: Santiago y Valeria</p>
                    </div>
                `
            })
        });
    } catch (err) {
        console.warn("No se pudo enviar el correo de bienvenida:", err.message);
    }
}

function mostrarMensaje(texto, tipo) {
    msgGlobal.textContent = texto;
    msgGlobal.className = "mensaje-global " + tipo;
    msgGlobal.style.display = "block";
}