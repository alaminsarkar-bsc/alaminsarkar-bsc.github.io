// modules/InfiniteScrollManager.js
class InfiniteScrollManager {
    constructor(containerId, loadMoreCallback, options = {}) {
        this.container = document.getElementById(containerId);
        this.loadMoreCallback = loadMoreCallback;
        this.options = {
            itemsPerPage: 10,
            loadingDelay: 300,
            threshold: 0.8,
            ...options
        };
        
        this.isLoading = false;
        this.hasMore = true;
        this.currentPage = 0;
        this.observer = null;
        
        this.init();
    }

    init() {
        if (!this.container) {
            console.error('Container not found:', this.containerId);
            return;
        }

        this.setupIntersectionObserver();
        this.setupScrollListener();
    }

    setupIntersectionObserver() {
        // Intersection Observer for modern browsers
        if ('IntersectionObserver' in window) {
            this.observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting && !this.isLoading && this.hasMore) {
                            this.loadMore();
                        }
                    });
                },
                {
                    rootMargin: '100px 0px',
                    threshold: 0.1
                }
            );

            this.createTriggerElement();
        }
    }

    setupScrollListener() {
        // Fallback scroll listener
        window.addEventListener('scroll', this.handleScroll.bind(this));
    }

    handleScroll() {
        if (this.isLoading || !this.hasMore) return;

        const scrollTop = window.scrollY;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        const scrollPercentage = (scrollTop + windowHeight) / documentHeight;

        if (scrollPercentage > this.options.threshold) {
            this.loadMore();
        }
    }

    createTriggerElement() {
        this.triggerElement = document.createElement('div');
        this.triggerElement.className = 'infinite-scroll-trigger';
        this.triggerElement.style.cssText = `
            height: 1px;
            visibility: hidden;
            pointer-events: none;
        `;
        this.container.appendChild(this.triggerElement);
        this.observer.observe(this.triggerElement);
    }

    async loadMore() {
        if (this.isLoading || !this.hasMore) return;

        this.isLoading = true;
        this.showLoadingIndicator();

        try {
            const nextPage = this.currentPage + 1;
            const newData = await this.loadMoreCallback(nextPage);
            
            if (newData && newData.length > 0) {
                this.currentPage = nextPage;
                await this.appendData(newData);
                
                // Check if more data might be available
                this.hasMore = newData.length >= this.options.itemsPerPage;
                
                // Update trigger element position
                this.updateTriggerElement();
            } else {
                this.hasMore = false;
                this.showNoMoreData();
            }
        } catch (error) {
            console.error('Error loading more data:', error);
            this.showError();
        } finally {
            this.isLoading = false;
            this.hideLoadingIndicator();
            
            // Re-observe trigger element after new content is added
            if (this.observer && this.triggerElement) {
                setTimeout(() => {
                    this.observer.observe(this.triggerElement);
                }, 100);
            }
        }
    }

    async appendData(newData) {
        if (!newData || newData.length === 0) return;

        // Create document fragment for better performance
        const fragment = document.createDocumentFragment();
        
        newData.forEach(item => {
            const element = this.createItemElement(item);
            if (element) {
                fragment.appendChild(element);
            }
        });

        // Insert before trigger element if it exists, otherwise append
        if (this.triggerElement && this.triggerElement.parentNode) {
            this.container.insertBefore(fragment, this.triggerElement);
        } else {
            this.container.appendChild(fragment);
        }

        // Dispatch custom event for other components
        this.container.dispatchEvent(new CustomEvent('infiniteScroll:itemsAdded', {
            detail: { count: newData.length }
        }));
    }

    createItemElement(item) {
        // This should be overridden by the parent class
        // or provided as a callback in options
        if (this.options.createItemElement) {
            return this.options.createItemElement(item);
        }
        
        // Default implementation
        const div = document.createElement('div');
        div.className = 'infinite-scroll-item';
        div.textContent = JSON.stringify(item);
        return div;
    }

    showLoadingIndicator() {
        this.removeLoadingIndicator(); // Remove existing first
        
        this.loadingIndicator = document.createElement('div');
        this.loadingIndicator.className = 'infinite-scroll-loading';
        this.loadingIndicator.innerHTML = `
            <div class="loading-spinner"></div>
            <p>লোড হচ্ছে...</p>
        `;
        
        if (this.triggerElement && this.triggerElement.parentNode) {
            this.container.insertBefore(this.loadingIndicator, this.triggerElement);
        } else {
            this.container.appendChild(this.loadingIndicator);
        }
    }

    hideLoadingIndicator() {
        this.removeLoadingIndicator();
    }

    removeLoadingIndicator() {
        if (this.loadingIndicator && this.loadingIndicator.parentNode) {
            this.loadingIndicator.remove();
        }
    }

    showNoMoreData() {
        this.removeNoMoreData(); // Remove existing first
        
        this.noMoreDataIndicator = document.createElement('div');
        this.noMoreDataIndicator.className = 'infinite-scroll-no-more';
        this.noMoreDataIndicator.innerHTML = `
            <p>✅ সব কন্টেন্ট লোড করা হয়েছে</p>
        `;
        
        if (this.triggerElement && this.triggerElement.parentNode) {
            this.container.insertBefore(this.noMoreDataIndicator, this.triggerElement);
        } else {
            this.container.appendChild(this.noMoreDataIndicator);
        }

        // Unobserve trigger element since no more data
        if (this.observer && this.triggerElement) {
            this.observer.unobserve(this.triggerElement);
        }
    }

    removeNoMoreData() {
        if (this.noMoreDataIndicator && this.noMoreDataIndicator.parentNode) {
            this.noMoreDataIndicator.remove();
        }
    }

    showError() {
        this.removeError(); // Remove existing first
        
        this.errorIndicator = document.createElement('div');
        this.errorIndicator.className = 'infinite-scroll-error';
        this.errorIndicator.innerHTML = `
            <p>❌ লোড করতে সমস্যা হয়েছে</p>
            <button class="retry-btn">আবার চেষ্টা করুন</button>
        `;
        
        this.errorIndicator.querySelector('.retry-btn').addEventListener('click', () => {
            this.retryLoad();
        });

        if (this.triggerElement && this.triggerElement.parentNode) {
            this.container.insertBefore(this.errorIndicator, this.triggerElement);
        } else {
            this.container.appendChild(this.errorIndicator);
        }
    }

    removeError() {
        if (this.errorIndicator && this.errorIndicator.parentNode) {
            this.errorIndicator.remove();
        }
    }

    retryLoad() {
        this.removeError();
        this.loadMore();
    }

    updateTriggerElement() {
        // Ensure trigger element is at the end
        if (this.triggerElement && this.triggerElement.parentNode) {
            this.container.appendChild(this.triggerElement);
        }
    }

    reset() {
        this.currentPage = 0;
        this.hasMore = true;
        this.isLoading = false;
        
        this.removeLoadingIndicator();
        this.removeNoMoreData();
        this.removeError();
        
        // Recreate trigger element
        if (this.triggerElement) {
            this.triggerElement.remove();
            this.createTriggerElement();
        }
    }

    destroy() {
        // Clean up
        if (this.observer) {
            this.observer.disconnect();
        }
        
        window.removeEventListener('scroll', this.handleScroll.bind(this));
        
        this.removeLoadingIndicator();
        this.removeNoMoreData();
        this.removeError();
        
        if (this.triggerElement) {
            this.triggerElement.remove();
        }
    }

    // Public method to manually trigger load more
    triggerLoad() {
        this.loadMore();
    }

    // Public method to check current state
    getState() {
        return {
            isLoading: this.isLoading,
            hasMore: this.hasMore,
            currentPage: this.currentPage,
            totalLoaded: this.currentPage * this.options.itemsPerPage
        };
    }
}

// Export the class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InfiniteScrollManager;
}