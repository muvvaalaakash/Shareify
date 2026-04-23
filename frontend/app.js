// ── Configuration ──────────────────────────────────────────
const API_BASE = "http://13.126.242.38:30080/api";

// ── State ──────────────────────────────────────────────────
let currentUser = null;
let currentToken = null;

// ── Initialization ─────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    let savedToken = null;
    let savedUser = null;

    try {
        savedToken = localStorage.getItem("token");
        savedUser = localStorage.getItem("user");
    } catch (err) {
        console.warn("localStorage is not available (likely because you are running via file:/// protocol). State will not persist.");
    }

    if (savedToken && savedUser && savedUser !== "undefined") {
        currentToken = savedToken;
        try {
            currentUser = JSON.parse(savedUser);
        } catch (e) { currentUser = null; currentToken = null; }

        if (currentUser) navigateTo("dashboard");
        else navigateTo("login");
    } else {
        navigateTo("login");
    }
    updateNav();
});

// ── UI Helpers ─────────────────────────────────────────────
function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = "toast"; }, 3000);
}

function updateNav() {
    const nav = document.getElementById("nav-links");
    if (currentUser) {
        nav.innerHTML = `
            <button onclick="navigateTo('dashboard')">Browse</button>
            <button onclick="navigateTo('add-item')">List Item</button>
            <button onclick="navigateTo('my-bookings')">My Bookings</button>
            <button onclick="logout()">Logout (${currentUser.name})</button>
        `;
    } else {
        nav.innerHTML = `
            <button onclick="navigateTo('login')">Login</button>
            <button onclick="navigateTo('register')">Register</button>
        `;
    }
}

function navigateTo(page, data = null) {
    const main = document.getElementById("main-content");
    main.innerHTML = ""; // Clear content

    if (page === "login") main.innerHTML = renderLogin();
    else if (page === "register") main.innerHTML = renderRegister();
    else if (page === "dashboard") { main.innerHTML = renderDashboard(); fetchItems(); }
    else if (page === "add-item") main.innerHTML = renderAddItem();
    else if (page === "item-details") { main.innerHTML = renderItemDetails(data); fetchReviews(data.item_id); }
    else if (page === "my-bookings") { main.innerHTML = renderMyBookings(); fetchMyBookings(); }

    updateNav();
}

function getAuthHeaders() {
    return {
        "Content-Type": "application/json",
        ...(currentToken ? { "Authorization": `Bearer ${currentToken}` } : {})
    };
}

// ── Auth Functions ─────────────────────────────────────────
async function login(e) {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok) {
            currentToken = data.access_token;
            try { localStorage.setItem("token", currentToken); } catch (err) { }

            // Fetch profile
            const profileRes = await fetch(`${API_BASE}/profile`, { headers: getAuthHeaders() });
            const profile = await profileRes.json();
            currentUser = profile;
            try { localStorage.setItem("user", JSON.stringify(profile)); } catch (err) { }

            showToast("Login successful!");
            navigateTo("dashboard");
        } else {
            showToast(data.detail || "Login failed", "error");
        }
    } catch (err) {
        showToast("Connection error", "error");
    }
}

async function register(e) {
    e.preventDefault();
    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
        const res = await fetch(`${API_BASE}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();

        if (res.ok) {
            showToast("Registration successful! Please login.");
            navigateTo("login");
        } else {
            showToast(data.detail || "Registration failed", "error");
        }
    } catch (err) {
        showToast("Connection error", "error");
    }
}

function logout() {
    currentUser = null;
    currentToken = null;
    try {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
    } catch (err) { }
    navigateTo("login");
}

// ── Views ──────────────────────────────────────────────────
function renderLogin() {
    return `
        <div class="glass card form-container">
            <h2 class="form-title">Welcome Back</h2>
            <form onsubmit="login(event)">
                <label>Email</label>
                <input type="email" id="email" required placeholder="you@example.com">
                <label>Password</label>
                <input type="password" id="password" required placeholder="••••••••">
                <button type="submit" class="btn">Login</button>
            </form>
            <p style="text-align:center; margin-top:1rem; color:var(--text-muted)">
                Don't have an account? <a href="#" style="color:var(--primary)" onclick="navigateTo('register')">Register</a>
            </p>
        </div>
    `;
}

function renderRegister() {
    return `
        <div class="glass card form-container">
            <h2 class="form-title">Create Account</h2>
            <form onsubmit="register(event)">
                <label>Name</label>
                <input type="text" id="name" required placeholder="John Doe">
                <label>Email</label>
                <input type="email" id="email" required placeholder="you@example.com">
                <label>Password</label>
                <input type="password" id="password" required placeholder="••••••••">
                <button type="submit" class="btn">Register</button>
            </form>
            <p style="text-align:center; margin-top:1rem; color:var(--text-muted)">
                Already have an account? <a href="#" style="color:var(--primary)" onclick="navigateTo('login')">Login</a>
            </p>
        </div>
    `;
}

function renderDashboard() {
    return `
        <div class="header-flex">
            <h2>Available Items</h2>
            <button class="btn btn-small" onclick="navigateTo('add-item')">+ List an Item</button>
        </div>
        <div class="items-grid" id="items-grid">
            <p>Loading items...</p>
        </div>
    `;
}

async function fetchItems() {
    try {
        const res = await fetch(`${API_BASE}/items`);
        const items = await res.json();
        const grid = document.getElementById("items-grid");

        if (items.length === 0) {
            grid.innerHTML = "<p>No items available right now.</p>";
            return;
        }

        grid.innerHTML = items.map(item => `
            <div class="item-card" onclick='navigateTo("item-details", ${JSON.stringify(item)})'>
                <div>
                    <div class="item-category">${item.category}</div>
                    <div class="item-title">${item.title}</div>
                </div>
                <div class="item-price">$${item.price_per_day.toFixed(2)} <span>/ day</span></div>
            </div>
        `).join("");
    } catch (err) {
        document.getElementById("items-grid").innerHTML = "<p>Error loading items.</p>";
    }
}

function renderAddItem() {
    return `
        <div class="glass card form-container">
            <h2 class="form-title">List a New Item</h2>
            <form onsubmit="addItem(event)">
                <label>Title</label>
                <input type="text" id="item-title" required placeholder="e.g. Power Drill">
                
                <label>Category</label>
                <select id="item-category" required>
                    <option value="Electronics">Electronics</option>
                    <option value="Furniture">Furniture</option>
                    <option value="Kitchen">Kitchen</option>
                    <option value="Tools">Tools</option>
                </select>
                
                <label>Price per Day ($)</label>
                <input type="number" id="item-price" required min="1" step="0.01" placeholder="15.00">
                
                <button type="submit" class="btn">Add Item</button>
            </form>
        </div>
    `;
}

async function addItem(e) {
    e.preventDefault();
    const title = document.getElementById("item-title").value;
    const category = document.getElementById("item-category").value;
    const price_per_day = parseFloat(document.getElementById("item-price").value);

    try {
        const res = await fetch(`${API_BASE}/items`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ title, category, price_per_day })
        });
        const data = await res.json();
        if (res.ok) {
            showToast("Item listed successfully!");
            navigateTo("dashboard");
        } else {
            showToast(data.detail || "Failed to add item", "error");
        }
    } catch (err) {
        showToast("Connection error", "error");
    }
}

function renderItemDetails(item) {
    const isOwner = currentUser && item.owner_id === currentUser.user_id;
    window.currentItem = item; // Save for booking/review forms

    return `
        <div class="glass card">
            <button class="btn btn-small btn-secondary" style="margin-bottom:1.5rem" onclick="navigateTo('dashboard')">← Back</button>
            <div class="details-grid">
                <div>
                    <div class="item-category">${item.category}</div>
                    <h1 style="margin-bottom: 1rem; font-size: 2.5rem;">${item.title}</h1>
                    <div class="item-price">$${item.price_per_day.toFixed(2)} <span>/ day</span></div>
                    
                    ${!isOwner ? `
                        <div style="margin-top: 2rem; padding-top: 2rem; border-top: 1px solid var(--surface-border)">
                            <h3>Book this Item</h3>
                            <form onsubmit="bookItem(event)" style="margin-top: 1rem;">
                                <label>Start Date</label>
                                <input type="date" id="start-date" required>
                                <label>End Date</label>
                                <input type="date" id="end-date" required>
                                <button type="submit" class="btn">Confirm Booking</button>
                            </form>
                        </div>
                    ` : `
                        <div style="margin-top: 2rem; padding: 1rem; background: rgba(138,43,226,0.1); border-radius: 8px;">
                            <p><strong>✨ You own this item</strong></p>
                        </div>
                    `}
                </div>
                
                <div>
                    <h3>Reviews</h3>
                    <div id="reviews-container" style="margin-top: 1rem; margin-bottom: 2rem;">
                        Loading reviews...
                    </div>
                    
                    ${!isOwner ? `
                        <div style="padding-top: 1rem; border-top: 1px solid var(--surface-border)">
                            <h4>Leave a Review</h4>
                            <form onsubmit="submitReview(event)" style="margin-top: 1rem;">
                                <select id="review-rating" required style="margin-bottom: 0.5rem">
                                    <option value="" disabled selected>Select Rating</option>
                                    <option value="5">⭐⭐⭐⭐⭐ (5)</option>
                                    <option value="4">⭐⭐⭐⭐ (4)</option>
                                    <option value="3">⭐⭐⭐ (3)</option>
                                    <option value="2">⭐⭐ (2)</option>
                                    <option value="1">⭐ (1)</option>
                                </select>
                                <textarea id="review-comment" rows="3" placeholder="Write your review here..."></textarea>
                                <button type="submit" class="btn btn-small">Submit Review</button>
                            </form>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

async function bookItem(e) {
    e.preventDefault();
    const start_date = document.getElementById("start-date").value;
    const end_date = document.getElementById("end-date").value;
    const item_id = window.currentItem.item_id;

    try {
        const res = await fetch(`${API_BASE}/bookings`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ item_id, start_date, end_date })
        });
        const data = await res.json();

        if (res.ok) {
            showToast(`Booking Confirmed! Total: $${data.total_price}`, "success");
            navigateTo("my-bookings");
        } else {
            showToast(data.detail || "Booking failed", "error");
        }
    } catch (err) {
        showToast("Connection error", "error");
    }
}

async function fetchReviews(item_id) {
    try {
        const res = await fetch(`${API_BASE}/reviews?item_id=${item_id}`);
        const data = await res.json();
        const container = document.getElementById("reviews-container");

        if (!data.reviews || data.reviews.length === 0) {
            container.innerHTML = "<p style='color:var(--text-muted)'>No reviews yet.</p>";
            return;
        }

        container.innerHTML = `
            <div style="margin-bottom:1rem">
                <strong>Average Rating:</strong> ⭐ ${data.average_rating} / 5 (${data.total_reviews} reviews)
            </div>
            ${data.reviews.map(r => `
                <div class="review-box">
                    <div class="review-header">
                        <span class="rating-stars">${"⭐".repeat(r.rating)}</span>
                        <span style="font-size:0.8rem; color:var(--text-muted)">${new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    <p style="margin-top:0.5rem; font-size:0.9rem">${r.comment || "<i>No comment provided</i>"}</p>
                </div>
            `).join("")}
        `;
    } catch (err) {
        document.getElementById("reviews-container").innerHTML = "<p>Error loading reviews.</p>";
    }
}

async function submitReview(e) {
    e.preventDefault();
    const rating = parseInt(document.getElementById("review-rating").value);
    const comment = document.getElementById("review-comment").value;
    const item_id = window.currentItem.item_id;

    try {
        const res = await fetch(`${API_BASE}/reviews`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ item_id, rating, comment })
        });

        if (res.ok) {
            showToast("Review submitted successfully!");
            fetchReviews(item_id);
            document.getElementById("review-comment").value = "";
            document.getElementById("review-rating").value = "";
        } else {
            const data = await res.json();
            showToast(data.detail || "Failed to submit review", "error");
        }
    } catch (err) {
        showToast("Connection error", "error");
    }
}

function renderMyBookings() {
    return `
        <h2>My Bookings</h2>
        <div id="bookings-list" style="margin-top: 2rem;">
            Loading bookings...
        </div>
    `;
}

async function fetchMyBookings() {
    try {
        const res = await fetch(`${API_BASE}/bookings`, { headers: getAuthHeaders() });
        const bookings = await res.json();
        const list = document.getElementById("bookings-list");

        if (bookings.length === 0) {
            list.innerHTML = "<p>You have no bookings yet.</p>";
            return;
        }

        list.innerHTML = bookings.map(b => `
            <div class="glass card" style="margin-bottom: 1.5rem; padding: 1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <div>
                        <h3 style="margin-bottom:0.5rem">Booking ID: <span style="font-size:0.9rem; font-weight:normal">${b.booking_id}</span></h3>
                        <p style="color:var(--text-muted); margin-bottom:0.5rem">Dates: ${b.start_date} to ${b.end_date}</p>
                        <p><strong>Total Price:</strong> $${b.total_price.toFixed(2)}</p>
                    </div>
                    <div style="background:var(--success); padding:0.3rem 0.8rem; border-radius:20px; font-size:0.8rem; font-weight:bold;">
                        ${b.status.toUpperCase()}
                    </div>
                </div>
            </div>
        `).join("");
    } catch (err) {
        document.getElementById("bookings-list").innerHTML = "<p>Error loading bookings.</p>";
    }
}
