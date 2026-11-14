package com.philomath.api.store;

import com.philomath.api.dto.Shipment;
import com.philomath.api.dto.ShipmentPage;
import com.philomath.api.dto.ShipmentQuery;
import com.philomath.api.dto.ShipmentRequest;
import com.philomath.api.dto.ShipmentUpdate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
public class ShipmentStore {

    private final ShipmentRepository shipments;

    public ShipmentStore(ShipmentRepository shipments) {
        this.shipments = shipments;
    }

    @Transactional
    public Shipment create(ShipmentRequest request) {
        return shipments.save(ShipmentEntity.from(request)).toRecord();
    }

    @Transactional(readOnly = true)
    public Optional<Shipment> findById(long id) {
        return shipments.findById(id).map(ShipmentEntity::toRecord);
    }

    @Transactional(readOnly = true)
    public ShipmentPage query(ShipmentQuery query) {
        int page = query.page() == null ? 0 : query.page();
        int size = query.size() == null ? 20 : query.size();
        String reference = query.reference() == null ? "" : query.reference().trim();
        Page<ShipmentEntity> result = reference.isEmpty()
                ? shipments.findAllByOrderByIdAsc(PageRequest.of(page, size))
                : shipments.findByReferenceContainingIgnoreCaseOrderByIdAsc(reference, PageRequest.of(page, size));
        return new ShipmentPage(
                result.getContent().stream().map(ShipmentEntity::toRecord).toList(),
                page,
                size,
                result.getTotalElements(),
                result.getTotalPages()
        );
    }

    @Transactional
    public Optional<Shipment> update(ShipmentUpdate request) {
        return shipments.findById(request.id()).map(entity -> {
            entity.apply(request);
            return shipments.save(entity).toRecord();
        });
    }

    @Transactional
    public boolean delete(long id) {
        if (!shipments.existsById(id)) {
            return false;
        }
        shipments.deleteById(id);
        return true;
    }

    @Transactional
    public void clear() {
        shipments.deleteAllInBatch();
    }
}
