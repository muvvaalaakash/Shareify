// ── Configuration ──────────────────────────────────────────
const API_BASE = "/api";

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
            <button onclick="navigateTo('my-payments')">My Payments</button>
            <button onclick="navigateTo('faqs')">FAQs</button>
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
    else if (page === "my-payments") { main.innerHTML = renderMyPayments(); fetchMyPayments(); }
    else if (page === "faqs") { main.innerHTML = renderFAQs(); }

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
            <h2>Explore Catalog</h2>
            <button class="btn btn-small" onclick="navigateTo('add-item')">+ List an Item</button>
        </div>

        <div class="search-container glass" style="padding: 1.5rem; margin-bottom: 2rem; border-radius: 15px;">
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                <input type="text" id="search-input" placeholder="Search for items..." 
                    style="flex: 1; min-width: 250px; margin-bottom: 0;"
                    oninput="handleSearch()">
                
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;" id="category-filters">
                    <button class="btn btn-small btn-secondary active" onclick="filterItems('All', this)">All</button>
                    <button class="btn btn-small btn-secondary" onclick="filterItems('Electronics', this)">Electronics</button>
                    <button class="btn btn-small btn-secondary" onclick="filterItems('Tools', this)">Tools</button>
                    <button class="btn btn-small btn-secondary" onclick="filterItems('Furniture', this)">Furniture</button>
                    <button class="btn btn-small btn-secondary" onclick="filterItems('Kitchen', this)">Kitchen</button>
                </div>
            </div>
        </div>

        <div class="items-grid" id="items-grid">
            <p>Loading items...</p>
        </div>
    `;
}

// Global state for filters
window.currentCategory = 'All';
window.searchQuery = '';

function handleSearch() {
    window.searchQuery = document.getElementById("search-input").value;
    fetchItems(window.currentCategory === 'All' ? null : window.currentCategory, window.searchQuery);
}

function filterItems(category, btn) {
    window.currentCategory = category;
    
    // Update active button UI
    const btns = document.querySelectorAll("#category-filters button");
    btns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    fetchItems(category === 'All' ? null : category, window.searchQuery);
}

async function fetchItems(category = null, q = null) {
    try {
        let url = `${API_BASE}/items`;
        const params = new URLSearchParams();
        if (category) params.append("category", category);
        if (q) params.append("q", q);
        if (params.toString()) url += `?${params.toString()}`;

        const res = await fetch(url);
        const items = await res.json();
        const grid = document.getElementById("items-grid");

        if (items.length === 0) {
            grid.innerHTML = "<p>No items available right now.</p>";
            return;
        }

        grid.innerHTML = items.map(item => `
            <div class="item-card" onclick='navigateTo("item-details", ${JSON.stringify(item)})'>
                ${item.image_url ? `<img src="${item.image_url}" class="item-image" alt="${item.title}" onerror="this.src='https://placehold.co/400x300?text=No+Image'">` : `<div class="item-no-image">No Image</div>`}
                <div style="padding: 1.5rem;">
                    <div class="item-category">${item.category}</div>
                    <div class="item-title">${item.title}</div>
                    <div class="item-price">$${item.price_per_day.toFixed(2)} <span>/ day</span></div>
                </div>
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

                <label>Image URL (optional)</label>
                <input type="url" id="item-image" placeholder="https://example.com/image.jpg">
                
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
    const image_url = document.getElementById("item-image").value;

    try {
        const res = await fetch(`${API_BASE}/items`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ title, category, price_per_day, image_url })
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
                    ${item.image_url ? `<img src="${item.image_url}" class="item-details-image" alt="${item.title}" onerror="this.style.display='none'">` : ''}
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
                                <label>Your Email (for confirmation)</label>
                                <input type="email" id="customer-email" required placeholder="you@example.com">
                                <button type="submit" class="btn">Confirm Booking</button>
                            </form>
                        </div>
                    ` : `
                        <div style="margin-top: 2rem; padding: 1.5rem; background: rgba(138,43,226,0.1); border-radius: 12px; border: 1px solid var(--primary);">
                            <p style="margin-bottom: 1rem;"><strong>✨ You own this item</strong></p>
                            <button class="btn btn-small btn-secondary" onclick="deleteItem('${item.item_id}')" style="background: rgba(255,0,0,0.1); color: #ff4d4d; border: 1px solid #ff4d4d;">Delete Product</button>
                        </div>
                    `}
                </div>
                
                <div>
                    <h3>Reviews</h3>
                    <div id="reviews-container" style="margin-top: 1rem; margin-bottom: 2rem;">
                        Loading reviews...
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function bookItem(e) {
    e.preventDefault();
    const start_date = document.getElementById("start-date").value;
    const end_date = document.getElementById("end-date").value;
    const customer_email = document.getElementById("customer-email").value;
    const item_id = window.currentItem.item_id;

    try {
        const res = await fetch(`${API_BASE}/bookings`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ item_id, start_date, end_date, customer_email })
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
    const item_id = window.currentReviewItemId;

    try {
        const res = await fetch(`${API_BASE}/reviews`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ item_id, rating, comment })
        });

        if (res.ok) {
            showToast("Review submitted successfully!");
            navigateTo("my-bookings");
        } else {
            const data = await res.json();
            showToast(data.detail || "Failed to submit review", "error");
        }
    } catch (err) {
        showToast("Connection error", "error");
    }
}

async function completeBooking(booking_id) {
    try {
        const res = await fetch(`${API_BASE}/bookings/${booking_id}/complete`, {
            method: "PUT",
            headers: getAuthHeaders()
        });
        if (res.ok) {
            showToast("Booking marked as completed!");
            fetchMyBookings();
        } else {
            const data = await res.json();
            showToast(data.detail || "Failed to complete booking", "error");
        }
    } catch (err) {
        showToast("Connection error", "error");
    }
}

async function deleteItem(item_id) {
    if (!confirm("Are you sure you want to delete this product? This action cannot be undone.")) return;

    try {
        const res = await fetch(`${API_BASE}/items/${item_id}`, {
            method: "DELETE",
            headers: getAuthHeaders()
        });
        if (res.ok) {
            showToast("Product deleted successfully");
            navigateTo("dashboard");
        } else {
            const data = await res.json();
            showToast(data.detail || "Failed to delete product", "error");
        }
    } catch (err) {
        showToast("Connection error", "error");
    }
}

function showReviewForm(item_id, item_title) {
    window.currentReviewItemId = item_id;
    const main = document.getElementById("main-content");
    main.innerHTML = `
        <div class="glass card form-container">
            <button class="btn btn-small btn-secondary" style="margin-bottom:1.5rem" onclick="navigateTo('my-bookings')">← Back</button>
            <h2 class="form-title">Review: ${item_title}</h2>
            <form onsubmit="submitReview(event)">
                <label>Rating</label>
                <select id="review-rating" required style="margin-bottom: 1rem">
                    <option value="" disabled selected>Select Rating</option>
                    <option value="5">⭐⭐⭐⭐⭐ (5)</option>
                    <option value="4">⭐⭐⭐⭐ (4)</option>
                    <option value="3">⭐⭐⭐ (3)</option>
                    <option value="2">⭐⭐ (2)</option>
                    <option value="1">⭐ (1)</option>
                </select>
                <label>Comment</label>
                <textarea id="review-comment" rows="4" placeholder="How was your experience using this item?"></textarea>
                <button type="submit" class="btn">Submit Review</button>
            </form>
        </div>
    `;
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
                        <p style="margin-bottom:1rem"><strong>Total Price:</strong> $${b.total_price.toFixed(2)}</p>
                        
                        ${b.status === 'confirmed' ? `
                            <button class="btn btn-small" onclick="completeBooking('${b.booking_id}')">Mark as Received/Used</button>
                        ` : ''}
                        
                        ${b.status === 'completed' ? `
                            <button class="btn btn-small btn-primary" onclick="showReviewForm('${b.item_id}', 'Item ${b.item_id}')">Leave a Review</button>
                        ` : ''}
                    </div>
                    <div style="background:${b.status === 'completed' ? 'var(--primary)' : 'var(--success)'}; padding:0.3rem 0.8rem; border-radius:20px; font-size:0.8rem; font-weight:bold;">
                        ${b.status.toUpperCase()}
                    </div>
                </div>
            </div>
        `).join("");
    } catch (err) {
        document.getElementById("bookings-list").innerHTML = "<p>Error loading bookings.</p>";
    }
}
function renderMyPayments() {
    return `
        <h2>My Payments</h2>
        <div id="payments-list" style="margin-top: 2rem;">
            Loading payments...
        </div>
    `;
}

async function fetchMyPayments() {
    try {
        // We get payments by looking at our bookings which have payment IDs
        const res = await fetch(`${API_BASE}/bookings`, { headers: getAuthHeaders() });
        const bookings = await res.json();
        const list = document.getElementById("payments-list");

        const paidBookings = bookings.filter(b => b.payment_id);

        if (paidBookings.length === 0) {
            list.innerHTML = "<p>No payment records found.</p>";
            return;
        }

        list.innerHTML = paidBookings.map(b => `
            <div class="glass card" style="margin-bottom: 1.5rem; padding: 1.5rem; border-left: 5px solid var(--success);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.3rem">Transaction Date: ${new Date(b.created_at).toLocaleDateString()}</p>
                        <h3 style="margin-bottom:0.5rem">Payment ID: <span style="font-size:0.9rem; font-weight:normal">${b.payment_id}</span></h3>
                        <p><strong>Amount Paid:</strong> $${b.total_price.toFixed(2)}</p>
                        <p style="font-size:0.85rem; margin-top:0.5rem">For Booking: <span style="color:var(--primary)">${b.booking_id}</span></p>
                    </div>
                    <div style="text-align:right">
                        <span style="color:var(--success); font-weight:bold;">● COMPLETED</span>
                    </div>
                </div>
            </div>
        `).join("");
    } catch (err) {
        document.getElementById("payments-list").innerHTML = "<p>Error loading payment history.</p>";
    }
}
function renderFAQs() {
    const faqs = [
        { q: "How do I list an item?", a: "Click on 'List Item' in the navigation bar, fill in the details, and set a price!" },
        { q: "Is Shareify secure?", a: "Yes! We use JWT authentication and secure backend microservices to protect your data." },
        { q: "How do I pay?", a: "When you book an item, our payment service handles a mock transaction automatically." },
        { q: "Can I delete my listed products?", a: "Yes, you can delete any items you own from the product details page." },
        { q: "How do I leave a review?", a: "You can leave a review after your booking status is marked as 'Completed'." }
    ];

    return `
        <div class="faq-container" style="max-width: 800px; margin: 0 auto;">
            <h2 style="text-align:center; margin-bottom: 2rem;">Frequently Asked Questions</h2>
            ${faqs.map(f => `
                <div class="glass card" style="margin-bottom: 1.5rem; padding: 1.5rem;">
                    <h3 style="color:var(--primary); margin-bottom: 0.5rem;">Q: ${f.q}</h3>
                    <p>A: ${f.a}</p>
                </div>
            `).join("")}
        </div>
    `;
}
