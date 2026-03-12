import ScraperFC as sfc
import pandas as pd
import os

def get_fbref_players_last_5(league):
    """
    Scrape FBref player stats for the 5 most recent seasons of a league.
    """
    fb = sfc.FBref(wait_time=6)

    valid_seasons = fb.get_valid_seasons(league)
    print("Valid seasons:", valid_seasons)

    last_5_seasons = sorted(
        valid_seasons.keys(),
        key=lambda k: int(k.split("-")[0]),  # sort by start year
        reverse=True
    )[:5]
    season = last_5_seasons[0]
    print(f"Most recent season for testing: {season}")

    stats_dict = fb.scrape_all_stats(season, league)

    os.makedirs("fbref_stats_csv", exist_ok=True)
    for category, cat_dict in stats_dict.items():
        for subcategory in ["squad", "opponent", "player"]:
            df = cat_dict.get(subcategory)
            if isinstance(df, pd.DataFrame) and not df.empty:
                df.to_csv(f"fbref_stats_csv/{category}_{subcategory}.csv", index=False)
                print(f"Saved {category}_{subcategory}.csv with {len(df)} rows")


league = "England Premier League"
test_df = get_fbref_players_last_5(league)