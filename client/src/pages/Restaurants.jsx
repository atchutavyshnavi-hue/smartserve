import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import RestaurantCard from '../components/RestaurantCard';
import Skeleton from '../components/Skeleton';
import { useLanguage } from '../context/LanguageContext';

export default function Restaurants() {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const [restaurants, setRestaurants] = useState(null);
  const [filters, setFilters] = useState({
    q: params.get('q') || '',
    cuisine: params.get('cuisine') || '',
    minRating: '',
    sort: 'rating',
  });

  useEffect(() => {
    setRestaurants(null);
    const query = {};
    if (filters.q) query.q = filters.q;
    if (filters.cuisine) query.cuisine = filters.cuisine;
    if (filters.minRating) query.minRating = filters.minRating;
    if (filters.sort) query.sort = filters.sort;
    api.get('/restaurants', { params: query }).then(({ data }) => {
      setRestaurants(data.data.restaurants);
    });
  }, [filters]);

  return (
    <div className="restaurants-page">
      <aside className="filters">
        <h3>{t('rest.filters')}</h3>
        <label>{t('rest.search')}
          <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </label>
        <label>{t('rest.minRating')}
          <select value={filters.minRating} onChange={(e) => setFilters({ ...filters, minRating: e.target.value })}>
            <option value="">{t('common.any')}</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
            <option value="4.5">4.5+</option>
          </select>
        </label>
        <label>{t('rest.sortBy')}
          <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
            <option value="rating">{t('rest.rating')}</option>
            <option value="popularity">{t('rest.popularity')}</option>
            <option value="price_low">{t('rest.priceLow')}</option>
            <option value="price_high">{t('rest.priceHigh')}</option>
          </select>
        </label>
      </aside>
      <main>
        <h2>{t('rest.title')}</h2>
        {restaurants === null ? <Skeleton count={6} /> : restaurants.length === 0 ? (
          <div className="empty-state">{t('rest.none')}</div>
        ) : (
          <div className="restaurant-grid">
            {restaurants.map((r) => <RestaurantCard key={r._id} restaurant={r} />)}
          </div>
        )}
      </main>
    </div>
  );
}