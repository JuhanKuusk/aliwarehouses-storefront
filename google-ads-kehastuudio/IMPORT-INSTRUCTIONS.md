# Google Ads Import Instructions - Kehastuudio

## Files Created

| File | Description |
|------|-------------|
| `campaigns.csv` | 4 campaigns (2 Search, 2 Display) |
| `keywords.csv` | 37 keywords with ad groups |
| `responsive-search-ads.csv` | 6 Responsive Search Ads |
| `negative-keywords.csv` | 24 negative keywords |
| `sitelinks.csv` | 10 sitelink extensions |
| `callout-extensions.csv` | 16 callout extensions |
| `structured-snippets.csv` | 4 structured snippets |
| `image-assets.csv` | 18 image asset placeholders |

## How to Import

### Option 1: Google Ads Editor (Recommended)

1. **Download Google Ads Editor**: https://ads.google.com/intl/en_ee/home/tools/ads-editor/

2. **Open Google Ads Editor** and sign in to your account

3. **Import in this order**:
   - File → Import → From file → Select `campaigns.csv`
   - Review changes → Post changes
   - File → Import → From file → Select `keywords.csv`
   - Review changes → Post changes
   - File → Import → From file → Select `responsive-search-ads.csv`
   - Review changes → Post changes
   - File → Import → From file → Select `negative-keywords.csv`
   - Review changes → Post changes

4. **Post all changes** to your Google Ads account

### Option 2: Google Ads Web Interface (Bulk Upload)

1. Go to **Google Ads** → Tools & Settings → Bulk actions → Uploads

2. Upload each CSV file separately

3. Review and apply changes

## After Import Checklist

- [ ] Set daily budgets (currently set to €10-20/day)
- [ ] Review location targeting (Tallinn + Harjumaa)
- [ ] Set bid strategy or manual CPC bids
- [ ] Add payment method if not already set
- [ ] Enable campaigns when ready (currently paused)
- [ ] Set up conversion tracking
- [ ] Add remarketing audience for Display campaigns
- [ ] Upload images (see Image Assets section below)

---

## Image Assets - Manual Upload Required

Google Ads Editor cannot import images via CSV. You must upload images manually:

### In Google Ads Editor:
1. Go to **Assets** → **Images**
2. Click **+ Add image**
3. Upload images for each campaign

### Recommended Images:

**For Search Campaigns (Optional):**
- LPG massage treatment photo
- Cryolipolysis procedure
- Before/after results
- Studio interior

**For Display Campaigns (Required):**
- Square images: 1200x1200px
- Landscape images: 1200x628px
- Logo: 1200x1200px (square) + 1200x300px (landscape)

### Image Specifications:
- Format: JPG or PNG
- Max file size: 5MB
- No text overlay (or less than 20% of image)
- High quality, professional photos

### Suggested Image Sources:
1. Your own treatment photos
2. Before/after client photos (with permission)
3. Studio and equipment photos
4. Stock photos from kehastuudio.ee website

## Campaign Settings to Verify

| Setting | Recommended Value |
|---------|-------------------|
| Language | Estonian |
| Location | Tallinn, Harjumaa |
| Bid Strategy | Maximize Clicks (start), then Maximize Conversions |
| Device | All devices |
| Ad Schedule | All day (adjust after data) |

## Notes

- All campaigns are set to **Paused** - enable when ready
- Keywords use **Broad match** as requested
- Adjust Final URLs if you have specific landing pages for each service
