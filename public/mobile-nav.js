// Mobile Navigation Functionality for Dashboard
document.addEventListener("DOMContentLoaded", function () {
  const mobileMenuToggle = document.getElementById("mobileMenuToggle");
  const mobileNavOverlay = document.getElementById("mobileNavOverlay");
  const mobileNavClose = document.getElementById("mobileNavClose");
  const mobileNavLinks = document.querySelectorAll(".mobile-nav-link");

  // Toggle mobile navigation
  function toggleMobileNav() {
    if (!mobileNavOverlay || !mobileMenuToggle) return;

    mobileNavOverlay.classList.toggle("active");
    mobileMenuToggle.classList.toggle("active");

    // Prevent body scroll when modal is open
    if (mobileNavOverlay.classList.contains("active")) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }

  // Close mobile navigation
  function closeMobileNav() {
    if (!mobileNavOverlay || !mobileMenuToggle) return;

    mobileNavOverlay.classList.remove("active");
    mobileMenuToggle.classList.remove("active");
    document.body.style.overflow = "";
  }

  // Event listeners
  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener("click", toggleMobileNav);
  }

  if (mobileNavClose) {
    mobileNavClose.addEventListener("click", closeMobileNav);
  }

  // Close modal when clicking overlay
  if (mobileNavOverlay) {
    mobileNavOverlay.addEventListener("click", function (e) {
      if (e.target === mobileNavOverlay) {
        closeMobileNav();
      }
    });
  }

  // Close modal when clicking navigation links
  mobileNavLinks.forEach((link) => {
    link.addEventListener("click", closeMobileNav);
  });

  // Close modal on escape key
  document.addEventListener("keydown", function (e) {
    if (
      e.key === "Escape" &&
      mobileNavOverlay &&
      mobileNavOverlay.classList.contains("active")
    ) {
      closeMobileNav();
    }
  });

  // Handle window resize
  window.addEventListener("resize", function () {
    if (window.innerWidth > 768) {
      closeMobileNav();
    }
  });

  // Add touch support for mobile devices
  let startX = 0;
  let currentX = 0;
  let isDragging = false;

  if (mobileNavOverlay) {
    mobileNavOverlay.addEventListener("touchstart", function (e) {
      startX = e.touches[0].clientX;
      isDragging = true;
    });

    mobileNavOverlay.addEventListener("touchmove", function (e) {
      if (!isDragging) return;
      currentX = e.touches[0].clientX;
    });

    mobileNavOverlay.addEventListener("touchend", function (e) {
      if (!isDragging) return;
      isDragging = false;

      const diffX = startX - currentX;

      // If swiped left more than 100px, close the modal
      if (diffX > 100) {
        closeMobileNav();
      }
    });
  }
});
