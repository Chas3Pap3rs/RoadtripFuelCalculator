// Fetch coordinates using Google Geocoding API
function getCoordinates(address) {
    const apiKey = 'AIzaSyAYgnTJn54SwY8BWLPwKqzbXGR1i4zEyrQ'; // Replace with your actual API key
    return fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'OK' && data.results.length > 0) {
                const { lat, lng } = data.results[0].geometry.location;

                // Find city and state from address components
                const components = data.results[0].address_components;
                const city = components.find(component => component.types.includes('locality'))?.long_name || 
                             components.find(component => component.types.includes('administrative_area_level_2'))?.long_name;
                const state = components.find(component => component.types.includes('administrative_area_level_1'))?.long_name;

                return { lat, lon: lng, city, state };
            } else {
                throw new Error("No results found for the address");
            }
        });
}

// Fetch gas prices for a city using CollectAPI
function getGasPrice(city) {
    return fetch(`https://api.collectapi.com/gasPrice/fromCity?city=${encodeURIComponent(city)}&type=gasoline`, {
        headers: {
            'Authorization': 'apikey 74kh0JLVdpMZ3uu8rvIGzM:2RjAuKHIxwoKQal2MZ3c5I', // Replace with your actual API key
            'content-type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`CollectAPI Error: ${response.status} ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success && data.result.gasoline && data.result.unit === "liter") {
            // Convert price from liters to gallons
            const pricePerLiter = parseFloat(data.result.gasoline);
            const pricePerGallon = (pricePerLiter * 3.78541).toFixed(2);
            return pricePerGallon;
        } else {
            console.warn("Gas price data not available for the selected city or unexpected unit. Using default price.");
            return 3.50; // Default gas price in case data is not available
        }
    })
    .catch(error => {
        console.error("Error fetching gas prices:", error);
        return 3.50; // Default gas price in case of an error
    });
}

// Initialize the Google Maps API
function initMap() {
    // Map initialization can go here if needed
}

// Get route distance using Google Maps JavaScript API
function getRouteDistance(startLatLon, endLatLon) {
    return new Promise((resolve, reject) => {
        const directionsService = new google.maps.DirectionsService();
        
        const request = {
            origin: startLatLon,
            destination: endLatLon,
            travelMode: 'DRIVING'
        };

        directionsService.route(request, function(result, status) {
            if (status === 'OK') {
                const distanceMeters = result.routes[0].legs[0].distance.value;
                const distanceMiles = (distanceMeters / 1609.34).toFixed(2); // Convert to miles
                resolve(distanceMiles);
            } else {
                reject("Directions request failed due to " + status);
            }
        });
    });
}

document.getElementById("trip-form").addEventListener("submit", function(e) {
    e.preventDefault();

    // Hide the results container initially before processing
    document.getElementById("results").style.display = "none";

    const start = document.getElementById("start").value;
    const destination = document.getElementById("destination").value;
    const mpg = parseFloat(document.getElementById("mpg").value);
    const tankSize = parseFloat(document.getElementById("tank-size").value);
    const roundTrip = document.getElementById("round-trip").checked;

    if (!start || !destination || !mpg || !tankSize) {
        alert("Please fill in all fields.");
        return;
    }

    // Get coordinates for the start and destination locations
    Promise.all([getCoordinates(start), getCoordinates(destination)])
        .then(([startCoords, endCoords]) => {
            const startLatLon = new google.maps.LatLng(startCoords.lat, startCoords.lon);
            const endLatLon = new google.maps.LatLng(endCoords.lat, endCoords.lon);

            return getRouteDistance(startLatLon, endLatLon)
                .then(distanceMiles => {
                    const totalDistance = roundTrip ? distanceMiles * 2 : distanceMiles;
                    return { totalDistance, startCoords, endCoords };
                });
        })
        .then(({ totalDistance, startCoords }) => {
            // Use the city from startCoords for the gas price
            const city = startCoords.city; // Adjust this to match the actual city property from the Geocoding result
            return getGasPrice(city)
                .then(gasPrice => {
                    const stops = Math.ceil(totalDistance / (mpg * tankSize) - 1);
                    const totalFuel = (totalDistance / mpg).toFixed(2);
                    const totalCost = (totalFuel * gasPrice).toFixed(2);

                    // Show the results container
                    document.getElementById("results").style.display = "block";

                    // Display results
                    document.getElementById("results").innerHTML = `
                        <p>Total Distance: ${totalDistance} miles</p>
                        <p>Fuel Stops Needed: ${stops}</p>
                        <p>Total Fuel Needed: ${totalFuel} gallons</p>
                        <p>Gas Price: $${gasPrice} per gallon</p>
                        <p>Total Estimated Cost: $${totalCost}</p>
                    `;
                });
        })
        .catch(error => {
            console.error("Error:", error);
            document.getElementById("results").style.display = "block"; // Show results container for error message
            document.getElementById("results").innerHTML = `<p style="color: red;">Error calculating route or fetching gas prices. Please check your inputs and try again.</p>`;
        });
});