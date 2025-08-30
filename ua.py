#!/usr/bin/env python3
"""
Powerful User-Agent Scraper
Scrapes user agents from multiple reliable sources and saves to ua.txt
"""

import requests
from bs4 import BeautifulSoup
import json
import concurrent.futures
from typing import List, Set
import time
import random

class UserAgentScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        self.unique_user_agents: Set[str] = set()
        
    def scrape_whatismybrowser(self) -> List[str]:
        """Scrape from whatismybrowser.com"""
        print("Scraping whatismybrowser.com...")
        user_agents = []
        try:
            url = "https://developers.whatismybrowser.com/useragents/explore/"
            response = self.session.get(url, timeout=10)
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Find user agent links
            for link in soup.find_all('a', href=True):
                if '/useragents/explore/hardware_type/' in link['href']:
                    hardware_url = f"https://developers.whatismybrowser.com{link['href']}"
                    try:
                        hardware_response = self.session.get(hardware_url, timeout=8)
                        hardware_soup = BeautifulSoup(hardware_response.text, 'html.parser')
                        
                        # Extract user agents from tables
                        tables = hardware_soup.find_all('table')
                        for table in tables:
                            rows = table.find_all('tr')
                            for row in rows[1:]:  # Skip header
                                cells = row.find_all('td')
                                if len(cells) > 1:
                                    ua = cells[0].text.strip()
                                    if ua and len(ua) > 10:
                                        user_agents.append(ua)
                        time.sleep(0.5)  # Be polite
                    except:
                        continue
        except Exception as e:
            print(f"Error scraping whatismybrowser: {e}")
        return user_agents

    def scrape_useragentstring(self) -> List[str]:
        """Scrape from useragentstring.com"""
        print("Scraping useragentstring.com...")
        user_agents = []
        try:
            browsers = [
                "latest-chrome-user-agent-string",
                "latest-firefox-user-agent-string",
                "latest-edge-user-agent-string",
                "latest-safari-user-agent-string",
                "latest-opera-user-agent-string"
            ]
            
            for browser in browsers:
                url = f"http://www.useragentstring.com/pages/{browser}/"
                response = self.session.get(url, timeout=10)
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Find user agent content
                content = soup.find('div', {'id': 'content'})
                if content:
                    lis = content.find_all('li')
                    for li in lis:
                        ua = li.text.strip()
                        if ua and 'user agent string' not in ua.lower() and len(ua) > 20:
                            user_agents.append(ua)
                time.sleep(0.3)
        except Exception as e:
            print(f"Error scraping useragentstring: {e}")
        return user_agents

    def scrape_github_repos(self) -> List[str]:
        """Get user agents from GitHub repositories"""
        print("Checking GitHub repositories...")
        user_agents = []
        try:
            # Try to get from popular user-agent repositories
            github_urls = [
                "https://raw.githubusercontent.com/intoli/user-agents/master/src/user-agents.json",
                "https://raw.githubusercontent.com/seleniumhq/selenium/master/common/src/web/user-agents.json",
            ]
            
            for url in github_urls:
                try:
                    response = self.session.get(url, timeout=15)
                    if response.status_code == 200:
                        if url.endswith('.json'):
                            data = response.json()
                            if isinstance(data, list):
                                user_agents.extend(data)
                            elif isinstance(data, dict):
                                # Handle different JSON structures
                                for key, value in data.items():
                                    if isinstance(value, list):
                                        user_agents.extend(value)
                                    elif isinstance(value, str):
                                        user_agents.append(value)
                except:
                    continue
        except Exception as e:
            print(f"Error scraping GitHub: {e}")
        return user_agents

    def scrape_udger(self) -> List[str]:
        """Scrape from udger.com"""
        print("Scraping udger.com...")
        user_agents = []
        try:
            url = "https://udger.com/resources/ua-list"
            response = self.session.get(url, timeout=10)
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Look for user agent tables
            tables = soup.find_all('table')
            for table in tables:
                rows = table.find_all('tr')
                for row in rows[1:]:  # Skip header
                    cells = row.find_all('td')
                    if len(cells) > 1:
                        ua = cells[1].text.strip()
                        if ua and len(ua) > 10:
                            user_agents.append(ua)
        except Exception as e:
            print(f"Error scraping udger: {e}")
        return user_agents

    def get_local_user_agents(self) -> List[str]:
        """Get some built-in common user agents"""
        common_agents = [
            # Chrome
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            
            # Firefox
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0",
            
            # Safari
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
            
            # Edge
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59",
        ]
        return common_agents

    def scrape_all_sources(self) -> Set[str]:
        """Scrape from all sources concurrently"""
        sources = [
            self.scrape_whatismybrowser,
            self.scrape_useragentstring,
            self.scrape_udger,
            self.scrape_github_repos,
            self.get_local_user_agents
        ]
        
        # Use thread pool for concurrent scraping
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            futures = [executor.submit(source) for source in sources]
            
            for future in concurrent.futures.as_completed(futures):
                try:
                    result = future.result()
                    for ua in result:
                        if ua and isinstance(ua, str) and len(ua) > 10:
                            self.unique_user_agents.add(ua.strip())
                except Exception as e:
                    print(f"Error in scraping thread: {e}")
        
        return self.unique_user_agents

    def save_to_file(self, filename: str = "ua.txt"):
        """Save user agents to file"""
        if not self.unique_user_agents:
            print("No user agents collected!")
            return
        
        # Sort for better readability
        sorted_agents = sorted(self.unique_user_agents)
        
        with open(filename, 'w', encoding='utf-8') as f:
            for ua in sorted_agents:
                f.write(f"{ua}\n")
        
        print(f"Successfully saved {len(sorted_agents)} unique user agents to {filename}")

def main():
    """Main function"""
    print("Starting User-Agent Scraper...")
    print("=" * 50)
    
    # Create scraper instance
    scraper = UserAgentScraper()
    
    # Scrape from all sources
    start_time = time.time()
    user_agents = scraper.scrape_all_sources()
    end_time = time.time()
    
    print(f"\nScraping completed in {end_time - start_time:.2f} seconds")
    print(f"Collected {len(user_agents)} unique user agents")
    
    # Save to file
    scraper.save_to_file("ua.txt")
    
    # Show sample
    print("\nSample user agents:")
    sample_agents = random.sample(sorted(user_agents), min(5, len(user_agents)))
    for i, ua in enumerate(sample_agents, 1):
        print(f"{i}. {ua}")
    
    print("\nDone!")

if __name__ == "__main__":
    main()
