package com.philomath.api;

import com.philomath.api.store.OrderStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.emptyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class OrderApiTest {

    private static final String VALID_ORDER = """
            {
              "orderNumber": "ORD-1001",
              "status": "CONFIRMED",
              "priority": "HIGH",
              "customerName": "Ada Lovelace",
              "customerEmail": "ada@example.com",
              "quantity": 2,
              "unitPrice": 19.5,
              "taxRate": 0.08,
              "currency": "HKD",
              "discountAmount": 0.0,
              "countryCode": "HK",
              "orderedAt": "2020-01-15T10:15:30+08:00",
              "requestedDeliveryDate": "2099-12-01",
              "notes": "Leave at reception",
              "giftWrap": true,
              "warehouseCode": "HK-01",
              "deliveryAddress": {
                "line1": "1 Harbour Road",
                "city": "Hong Kong",
                "postalCode": "999077",
                "region": {
                  "code": "HK-IS",
                  "name": "Hong Kong Island"
                }
              }
            }
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private OrderStore orders;

    @BeforeEach
    void emptyStore() {
        orders.clear();
    }

    @Test
    void trimsTextBeforeSaving() throws Exception {
        String padded = VALID_ORDER
                .replace("\"customerName\": \"Ada Lovelace\"", "\"customerName\": \"  Ada Lovelace  \"")
                .replace("\"notes\": \"Leave at reception\"", "\"notes\": \"   \"")
                .replace("\"warehouseCode\": \"HK-01\"", "\"warehouseCode\": \"  HK-01  \"")
                .replace("\"line1\": \"1 Harbour Road\"", "\"line1\": \"  1 Harbour Road  \"");
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(padded))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.customerName").value("Ada Lovelace"))
                .andExpect(jsonPath("$.warehouseCode").value("HK-01"))
                .andExpect(jsonPath("$.notes").value(nullValue()))
                .andExpect(jsonPath("$.deliveryAddress.line1").value("1 Harbour Road"));
    }

    @Test
    void rejectsAListFilterPastItsMaximumLength() throws Exception {
        mockMvc.perform(get("/api/orders").param("notes", "A".repeat(500)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/orders").param("notes", "A".repeat(501)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions", hasSize(1)))
                .andExpect(jsonPath("$.exceptions[0].field").value("notes"))
                .andExpect(jsonPath("$.exceptions[0].code").value("Size"));
    }

    @Test
    void createsReadsUpdatesAndDeletesAnOrder() throws Exception {
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ORDER))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/orders/1"))
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.orderNumber").value("ORD-1001"))
                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.deliveryAddress.line1").value("1 Harbour Road"))
                .andExpect(jsonPath("$.deliveryAddress.city").value("Hong Kong"))
                .andExpect(jsonPath("$.deliveryAddress.postalCode").value("999077"))
                .andExpect(jsonPath("$.deliveryAddress.region.code").value("HK-IS"))
                .andExpect(jsonPath("$.deliveryAddress.region.name").value("Hong Kong Island"));

        mockMvc.perform(get("/api/orders"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.totalPages").value(1))
                .andExpect(jsonPath("$.content[0].id").value(1));

        mockMvc.perform(get("/api/orders/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.customerEmail").value("ada@example.com"));

        String updated = VALID_ORDER.replace("\"quantity\": 2", "\"quantity\": 4");
        mockMvc.perform(put("/api/orders/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updated))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.quantity").value(4));

        mockMvc.perform(delete("/api/orders/1"))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/orders/1"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.exceptions", hasSize(1)))
                .andExpect(jsonPath("$.exceptions[0].field").value("id"))
                .andExpect(jsonPath("$.exceptions[0].code").value("NotFound"));
    }

    @Test
    void returnsEveryFieldViolationWithACode() throws Exception {
        String invalid = """
                {
                  "orderNumber": "ORD-1001",
                  "status": "CONFIRMED",
                  "priority": "HIGH",
                  "customerName": "Ada Lovelace",
                  "customerEmail": "not-an-email",
                  "quantity": -1,
                  "unitPrice": 19.5,
                  "taxRate": 2.0,
                  "currency": "HKD",
                  "discountAmount": 0.0,
                  "countryCode": "hk",
                  "orderedAt": "2020-01-15T10:15:30+08:00",
                  "requestedDeliveryDate": "2099-12-01",
                  "giftWrap": true,
                  "warehouseCode": "HK-01",
                  "deliveryAddress": {
                    "line1": "1 Harbour Road",
                    "city": "Hong Kong",
                    "postalCode": "999077",
                    "region": {
                      "code": "HK-IS",
                      "name": "Hong Kong Island"
                    }
                  }
                }
                """;

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalid))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.exceptions", hasSize(4)))
                .andExpect(jsonPath("$.exceptions[?(@.field == 'customerEmail')].code", hasItem("Email")))
                .andExpect(jsonPath("$.exceptions[?(@.field == 'quantity')].code", hasItem("Positive")))
                .andExpect(jsonPath("$.exceptions[?(@.field == 'taxRate')].code", hasItem("DecimalMax")))
                .andExpect(jsonPath("$.exceptions[?(@.field == 'countryCode')].code", hasItem("Pattern")));
    }

    @Test
    void acceptsAMissingEmptyOrNullDeliveryAddress() throws Exception {
        for (String address : new String[]{"\"deliveryAddress\": null", "\"deliveryAddress\": {}", "\"deliveryAddress\": {\"region\": {}}"}) {
            mockMvc.perform(post("/api/orders")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(replaceAddress(address)))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.deliveryAddress").value(nullValue()));
        }
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(omitAddress()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.deliveryAddress").value(nullValue()));
    }

    private static String replaceAddress(String addressJson) {
        int key = VALID_ORDER.indexOf("\"deliveryAddress\"");
        return VALID_ORDER.substring(0, key) + addressJson + VALID_ORDER.substring(addressEnd(key));
    }

    private static String omitAddress() {
        int key = VALID_ORDER.indexOf("\"deliveryAddress\"");
        return VALID_ORDER.substring(0, VALID_ORDER.lastIndexOf(',', key)) + VALID_ORDER.substring(addressEnd(key));
    }

    private static int addressEnd(int key) {
        int open = VALID_ORDER.indexOf('{', key);
        int depth = 0;
        for (int index = open; index < VALID_ORDER.length(); index++) {
            char character = VALID_ORDER.charAt(index);
            if (character == '{') depth++;
            else if (character == '}' && --depth == 0) return index + 1;
        }
        throw new IllegalStateException("deliveryAddress was not found");
    }

    @Test
    void rejectsAFieldInsideTheDeliveryAddress() throws Exception {
        String invalid = VALID_ORDER.replace("\"postalCode\": \"999077\"", "\"postalCode\": \"" + "P".repeat(13) + "\"");

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalid))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions", hasSize(1)))
                .andExpect(jsonPath("$.exceptions[0].field").value("deliveryAddress.postalCode"))
                .andExpect(jsonPath("$.exceptions[0].code").value("Size"));
    }

    @Test
    void namesAFieldOnTheThirdLevelOfTheAddress() throws Exception {
        String invalid = VALID_ORDER.replace("\"code\": \"HK-IS\"", "\"code\": \"" + "R".repeat(13) + "\"");

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalid))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions", hasSize(1)))
                .andExpect(jsonPath("$.exceptions[0].field").value("deliveryAddress.region.code"))
                .andExpect(jsonPath("$.exceptions[0].code").value("Size"));
    }

    @Test
    void rejectsTextPastMaxLengthAndNumbersPastMaxValue() throws Exception {
        String tooLong = VALID_ORDER
                .replace("ORD-1001", "N".repeat(41))
                .replace("Ada Lovelace", "N".repeat(81))
                .replace("\"quantity\": 2", "\"quantity\": 10001")
                .replace("\"unitPrice\": 19.5", "\"unitPrice\": 1000000.01")
                .replace("\"discountAmount\": 0.0", "\"discountAmount\": 1000000.01")
                .replace("\"countryCode\": \"HK\"", "\"countryCode\": \"HKG\"");

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(tooLong))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions[?(@.field == 'orderNumber')].code", hasItem("Size")))
                .andExpect(jsonPath("$.exceptions[?(@.field == 'customerName')].code", hasItem("Size")))
                .andExpect(jsonPath("$.exceptions[?(@.field == 'countryCode')].code", hasItem("Size")))
                .andExpect(jsonPath("$.exceptions[?(@.field == 'quantity')].code", hasItem("Max")))
                .andExpect(jsonPath("$.exceptions[?(@.field == 'unitPrice')].code", hasItem("DecimalMax")))
                .andExpect(jsonPath("$.exceptions[?(@.field == 'discountAmount')].code", hasItem("DecimalMax")));
    }

    @Test
    void collectsViolationsFromAnEmptyBody() throws Exception {
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions", hasSize(greaterThan(1))))
                .andExpect(jsonPath("$.exceptions[*].field", everyItem(not(emptyString()))))
                .andExpect(jsonPath("$.exceptions[*].code", everyItem(not(emptyString()))));
    }

    @Test
    void namesTheFieldWhenATimestampCannotBeRead() throws Exception {
        String invalid = VALID_ORDER.replace("2020-01-15T10:15:30+08:00", "${orderedAt}");

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalid))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions", hasSize(1)))
                .andExpect(jsonPath("$.exceptions[0].field").value("orderedAt"))
                .andExpect(jsonPath("$.exceptions[0].code").value("InvalidFormat"));
    }

    @Test
    void rejectsACouponTogetherWithAPromotion() throws Exception {
        String both = VALID_ORDER.replace(
                "\"notes\":",
                "\"couponCode\": \"SAVE10\", \"promotionCode\": \"SPRING\", \"notes\":");
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(both))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions", hasSize(2)))
                .andExpect(jsonPath("$.exceptions[?(@.field == 'couponCode')].code", hasItem("MutuallyExclusive")))
                .andExpect(jsonPath("$.exceptions[?(@.field == 'promotionCode')].code", hasItem("MutuallyExclusive")));

        String coupon = VALID_ORDER.replace("\"notes\":", "\"couponCode\": \"SAVE10\", \"notes\":");
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(coupon))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.couponCode").value("SAVE10"))
                .andExpect(jsonPath("$.promotionCode").value(nullValue()));
    }

    @Test
    void rejectsAnUnknownEnumWithTheFieldName() throws Exception {
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ORDER.replace("CONFIRMED", "SHIPPED")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions", hasSize(1)))
                .andExpect(jsonPath("$.exceptions[0].field").value("status"))
                .andExpect(jsonPath("$.exceptions[0].code").value("InvalidEnum"));
    }

    @Test
    void filtersTheOrderList() throws Exception {
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ORDER))
                .andExpect(status().isCreated());

        String second = VALID_ORDER
                .replace("ORD-1001", "ORD-2002")
                .replace("CONFIRMED", "DRAFT")
                .replace("HIGH", "LOW")
                .replace("Ada Lovelace", "Grace Hopper")
                .replace("ada@example.com", "grace@example.com")
                .replace("\"quantity\": 2", "\"quantity\": 9")
                .replace("HKD", "USD")
                .replace("\"countryCode\": \"HK\"", "\"countryCode\": \"US\"")
                .replace("HK-01", "US-01")
                .replace("\"giftWrap\": true", "\"giftWrap\": false");
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(second))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/orders"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(2)))
                .andExpect(jsonPath("$.totalElements").value(2));

        mockMvc.perform(get("/api/orders").param("status", "DRAFT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.content[0].orderNumber").value("ORD-2002"));

        mockMvc.perform(get("/api/orders").param("countryCode", "hk"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.content[0].orderNumber").value("ORD-1001"));

        mockMvc.perform(get("/api/orders").param("quantityMin", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.content[0].quantity").value(9));

        mockMvc.perform(get("/api/orders").param("customerName", "ada"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.content[0].customerName").value("Ada Lovelace"));
    }

    @Test
    void pagesTheOrderList() throws Exception {
        mockMvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON).content(VALID_ORDER))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ORDER.replace("ORD-1001", "ORD-1002")))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ORDER.replace("ORD-1001", "ORD-1003")))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/orders").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.content", hasSize(2)))
                .andExpect(jsonPath("$.content[0].orderNumber").value("ORD-1001"))
                .andExpect(jsonPath("$.content[1].orderNumber").value("ORD-1002"));

        mockMvc.perform(get("/api/orders").param("size", "2").param("page", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.content[0].orderNumber").value("ORD-1003"));

        mockMvc.perform(get("/api/orders").param("page", "-1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions[0].field").value("page"))
                .andExpect(jsonPath("$.exceptions[0].code").value("Min"));

        mockMvc.perform(get("/api/orders").param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions[0].field").value("size"))
                .andExpect(jsonPath("$.exceptions[0].code").value("Max"));
    }

    @Test
    void walksOrdersWithACursor() throws Exception {
        mockMvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON).content(VALID_ORDER))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ORDER.replace("ORD-1001", "ORD-1002").replace("CONFIRMED", "DRAFT")))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/orders").contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ORDER.replace("ORD-1001", "ORD-1003")))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/orders/cursor").param("limit", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.items[0].orderNumber").value("ORD-1001"))
                .andExpect(jsonPath("$.items[1].orderNumber").value("ORD-1002"))
                .andExpect(jsonPath("$.nextCursor").value("2"));

        mockMvc.perform(get("/api/orders/cursor").param("limit", "2").param("nextCursor", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].orderNumber").value("ORD-1003"))
                .andExpect(jsonPath("$.nextCursor").value(nullValue()));

        mockMvc.perform(get("/api/orders/cursor").param("limit", "2").param("status", "CONFIRMED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.items[0].orderNumber").value("ORD-1001"))
                .andExpect(jsonPath("$.items[1].orderNumber").value("ORD-1003"))
                .andExpect(jsonPath("$.nextCursor").value(nullValue()));

        mockMvc.perform(get("/api/orders/cursor").param("nextCursor", "abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions[0].field").value("nextCursor"))
                .andExpect(jsonPath("$.exceptions[0].code").value("InvalidFormat"));

        mockMvc.perform(get("/api/orders/cursor").param("limit", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions[0].field").value("limit"))
                .andExpect(jsonPath("$.exceptions[0].code").value("Max"));
    }

    @Test
    void acceptsAnEmptyOptionsObject() throws Exception {
        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ORDER.replace(
                                "\"warehouseCode\": \"HK-01\"",
                                "\"warehouseCode\": \"HK-01\",\n              \"options\": {}"
                        )))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.options").isMap())
                .andExpect(jsonPath("$.options").isEmpty());

        mockMvc.perform(post("/api/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ORDER.replace(
                                "\"warehouseCode\": \"HK-01\"",
                                "\"warehouseCode\": \"HK-02\",\n              \"options\": { \"extra\": true }"
                        )))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.exceptions[0].field").value("options"))
                .andExpect(jsonPath("$.exceptions[0].code").value("Size"));
    }

    @Test
    void publishesOrderCrudInOpenApi() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/orders'].get").exists())
                .andExpect(jsonPath("$.paths['/api/orders'].post").exists())
                .andExpect(jsonPath("$.paths['/api/orders/{id}'].get").exists())
                .andExpect(jsonPath("$.paths['/api/orders/{id}'].put").exists())
                .andExpect(jsonPath("$.paths['/api/orders/{id}'].delete").exists())
                .andExpect(jsonPath("$.paths['/api/orders'].get.tags[0]").value("Orders"))
                .andExpect(jsonPath("$.paths['/api/customers'].get.tags[0]").value("Customers"))
                .andExpect(jsonPath("$.paths['/api/customers'].post").exists())
                .andExpect(jsonPath("$.paths['/api/customers/{id}'].get").exists())
                .andExpect(jsonPath("$.paths['/api/customers/{id}'].put").exists())
                .andExpect(jsonPath("$.paths['/api/customers/{id}'].delete").exists())
                .andExpect(jsonPath("$.components.schemas.OrderRequest.required", hasSize(15)))
                .andExpect(jsonPath("$.components.schemas.OrderRequest.required", not(hasItem("deliveryAddress"))))
                .andExpect(jsonPath("$.components.schemas.OrderRequest.properties.couponCode").exists())
                .andExpect(jsonPath("$.components.schemas.OrderRequest.properties.promotionCode").exists())
                .andExpect(jsonPath("$.components.schemas.OrderRequest.properties.options").exists())
                .andExpect(jsonPath("$.components.schemas.Order.properties.options").exists())
                .andExpect(jsonPath("$.components.schemas.OrderRequest['x-mutually-exclusive'][0][0]").value("couponCode"))
                .andExpect(jsonPath("$.components.schemas.OrderRequest['x-mutually-exclusive'][0][1]").value("promotionCode"))
                .andExpect(jsonPath("$.components.schemas.DeliveryAddress.properties.line1").exists())
                .andExpect(jsonPath("$.components.schemas.DeliveryAddress.properties.region").exists())
                .andExpect(jsonPath("$.components.schemas.Region.properties.code").exists())
                .andExpect(jsonPath("$.components.schemas.CustomerProfile.properties.company").exists())
                .andExpect(jsonPath("$.components.schemas.DeliveryAddress.properties.city").exists())
                .andExpect(jsonPath("$.components.schemas.DeliveryAddress.properties.postalCode").exists())
                .andExpect(jsonPath("$.components.schemas.ApiErrorResponse.properties.exceptions").exists())
                .andExpect(jsonPath("$.components.schemas.OrderPage.properties.totalPages").exists())
                .andExpect(jsonPath("$.paths['/api/orders'].get.parameters[?(@.name == 'page')]").exists())
                .andExpect(jsonPath("$.paths['/api/orders'].get.parameters[?(@.name == 'size')]").exists())
                .andExpect(jsonPath("$.paths['/api/orders/cursor'].get.parameters[?(@.name == 'nextCursor')]").exists())
                .andExpect(jsonPath("$.paths['/api/orders/cursor'].get.parameters[?(@.name == 'limit')]").exists())
                .andExpect(jsonPath("$.components.schemas.OrderCursorPage.properties.nextCursor").exists())
                .andExpect(jsonPath("$.components.schemas.OrderCursorPage.properties.items").exists());

        mockMvc.perform(get("/v3/api-docs.yaml"))
                .andExpect(status().isOk());
    }

    @Test
    void allowsTheBrowserTesterToCallTheApi() throws Exception {
        mockMvc.perform(get("/v3/api-docs").header("Origin", "http://localhost:3000"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"));
    }
}
