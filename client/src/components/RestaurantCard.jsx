import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

export default function RestaurantCard({ restaurant }) {
  const { t, tn } = useLanguage();
  return (
    <Link to={`/restaurant/${restaurant._id}`} className="restaurant-card">
      <div className="restaurant-card-img" aria-hidden="true">
        {restaurant.coverImage
          ? <img src={restaurant.coverImage} alt="" />
          : <div className="img-placeholder">{tn(restaurant.name).charAt(0)}</div>}
      </div>
      <div className="restaurant-card-body">
        <h3>{tn(restaurant.name)}</h3>
        <p className="muted">{restaurant.cuisines?.map(tn).join(', ')}</p>
        <div className="restaurant-card-meta">
          <span className="rating-badge">★ {restaurant.rating}</span>
          <span>{t('card.min', { n: restaurant.avgPrepTimeMinutes })}</span>
          <span>{t('detail.forTwo', { n: restaurant.priceForTwo })}</span>
        </div>
      </div>
    </Link>
  );
}